-- ============================================================================
-- Prop Haus — inventory catalog (aggregated prop-house items + embeddings)
--
-- LOGICAL ISOLATION from accounts/billing/projects. Everything lives in its own
-- `catalog` schema and is written ONLY by a dedicated, narrowly-scoped role
-- (`catalog_writer`) that has NO privileges on `public`/`auth`. A re-scrape or a
-- catalog migration therefore cannot touch user accounts — not by policy, but
-- because the writing role has no grants there.
--
-- Isolation invariants enforced here:
--   * `catalog_writer` can write `catalog.*` and NOTHING else (explicit revokes
--     on public). The scrape/enrich/embed pipeline MUST connect as this role —
--     never via SUPABASE_SERVICE_ROLE_KEY, which bypasses all of this.
--   * Catalog is public read-only reference data: anon/authenticated get SELECT
--     only; all writes are denied to them. RLS is on as defense-in-depth.
--   * Re-scrape uses load-then-swap (staging table -> atomic swap), so the live
--     catalog is never half-written and readers always see a consistent set.
--
-- Scale note: ~100k items. Every migration here is seconds at this size; the
-- only multi-minute op is building the HNSW vector index.
-- ============================================================================

create extension if not exists vector with schema extensions;

create schema if not exists catalog;

-- ---------------------------------------------------------------------------
-- Main table — mirrors the PropItem zod schema (lib/types.ts).
-- ---------------------------------------------------------------------------
create table catalog.prop_items (
  id                  text primary key,                 -- e.g. "omega-12345"
  source              text not null,                    -- Source enum (lib/types.ts)
  source_id           text not null,                    -- vendor-native id
  name                text not null,
  description         text,

  category            text not null,
  subcategory         text,
  source_category_path text[] not null default '{}',

  -- AI-search discriminators (filled by the enrichment pass)
  style               text[],
  era                 text,
  materials           text[],
  colors              text[],
  vibes               text[],
  setting_type        text[],
  genre_fit           text[],
  tags                text[],

  dimensions          jsonb,                            -- {width,depth,height,unit}
  vendor              jsonb not null,                   -- VendorRef {id,name,city,sourceUrl}
  images              text[] not null default '{}',     -- image URLs (not binaries)
  source_url          text not null,
  scraped_at          timestamptz not null,

  -- 1536-dim embedding from text-embedding-3-small (lib/embeddings.ts).
  -- Use halfvec(1536) instead to roughly halve vector + index size with
  -- negligible recall loss, if storage ever matters.
  embedding           extensions.vector(1536),

  -- Full-text vector for the keyword/metadata search path. Maintained by the
  -- trigger below rather than a GENERATED column: to_tsvector with a regconfig
  -- is not treated as immutable, which a generated expression requires.
  search_tsv tsvector,

  unique (source, source_id)
);

-- Keep search_tsv in sync on write. Trigger bodies have no immutability
-- requirement, so the regconfig form is fine here.
create or replace function catalog.prop_items_tsv()
returns trigger
language plpgsql
set search_path = catalog, pg_temp
as $$
begin
  new.search_tsv := to_tsvector('english',
    coalesce(new.name, '') || ' ' ||
    coalesce(new.description, '') || ' ' ||
    coalesce(array_to_string(new.tags, ' '), '') || ' ' ||
    coalesce(array_to_string(new.style, ' '), '') || ' ' ||
    coalesce(new.category, '') || ' ' ||
    coalesce(new.subcategory, '')
  );
  return new;
end;
$$;

create trigger prop_items_tsv_sync
  before insert or update on catalog.prop_items
  for each row execute function catalog.prop_items_tsv();

create index prop_items_source_idx   on catalog.prop_items (source);
create index prop_items_category_idx on catalog.prop_items (category);
create index prop_items_tags_idx     on catalog.prop_items using gin (tags);
create index prop_items_tsv_idx      on catalog.prop_items using gin (search_tsv);
-- Vector ANN index. cosine matches lib/embeddings.ts. This is the one build
-- that takes minutes at 100k rows, not seconds.
create index prop_items_embedding_idx
  on catalog.prop_items using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Staging table — the re-scrape lands here first, then we swap it in atomically.
-- Same shape (including the generated tsvector), no ANN index (built on swap).
-- ---------------------------------------------------------------------------
create table catalog.prop_items_staging
  (like catalog.prop_items including defaults including constraints);

-- ---------------------------------------------------------------------------
-- Atomic swap. TRUNCATE + INSERT inside one transaction: other sessions keep
-- seeing the old rows until COMMIT, so there is never an empty/partial catalog.
-- ---------------------------------------------------------------------------
create or replace function catalog.swap_in_staging()
returns bigint
language plpgsql
set search_path = catalog, extensions, pg_temp
as $$
declare
  n bigint;
begin
  truncate catalog.prop_items;
  -- explicit column list: skip the generated search_tsv (recomputed on insert).
  insert into catalog.prop_items (
    id, source, source_id, name, description, category, subcategory,
    source_category_path, style, era, materials, colors, vibes, setting_type,
    genre_fit, tags, dimensions, vendor, images, source_url, scraped_at, embedding
  )
  select
    id, source, source_id, name, description, category, subcategory,
    source_category_path, style, era, materials, colors, vibes, setting_type,
    genre_fit, tags, dimensions, vendor, images, source_url, scraped_at, embedding
  from catalog.prop_items_staging;
  get diagnostics n = row_count;
  truncate catalog.prop_items_staging;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS — defense in depth. Catalog is public reference data: read-only to
-- everyone, writes only by roles with table grants (catalog_writer / service).
-- (The catalog schema is not exposed to the Data API by default; these policies
--  make read-exposure safe if it is ever turned on.)
-- ---------------------------------------------------------------------------
alter table catalog.prop_items         enable row level security;
alter table catalog.prop_items_staging enable row level security;

create policy "catalog is publicly readable" on catalog.prop_items
  for select to anon, authenticated using (true);
-- (no policy on staging => not readable by anon/authenticated at all)

-- ---------------------------------------------------------------------------
-- Scoped writer role. THIS is the isolation guarantee: it can touch catalog.*
-- and nothing else. Create with LOGIN but set its password out-of-band (never
-- in a committed migration):
--     alter role catalog_writer with password '<strong-secret>';
-- then point the pipeline's connection string at it. Until a password is set it
-- cannot connect.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'catalog_writer') then
    create role catalog_writer with login;
  end if;
end
$$;

grant usage on schema catalog to catalog_writer;
grant all privileges on all tables in schema catalog to catalog_writer;     -- includes TRUNCATE
grant all privileges on all sequences in schema catalog to catalog_writer;
grant execute on function catalog.swap_in_staging() to catalog_writer;
-- future catalog objects are writable by the pipeline without another migration
alter default privileges in schema catalog
  grant all privileges on tables to catalog_writer;
alter default privileges in schema catalog
  grant all privileges on sequences to catalog_writer;

-- Belt-and-suspenders: ensure the writer can NEVER reach accounts data.
revoke all on schema public from catalog_writer;
revoke usage  on schema public from catalog_writer;

-- Read access for the app (server-side / future Data API exposure).
grant usage on schema catalog to anon, authenticated;
grant select on catalog.prop_items to anon, authenticated;
grant select on all tables in schema catalog to service_role;
grant usage on schema catalog to service_role;

-- ---------------------------------------------------------------------------
comment on schema catalog is
  'Aggregated prop-house inventory + embeddings. Logically isolated from accounts: written only by the scoped catalog_writer role, which has no grants on public/auth.';
comment on table catalog.prop_items is
  'One row per aggregated prop. Public read-only reference data. Refreshed via load-then-swap from prop_items_staging; never written by the app at request time.';
comment on table catalog.prop_items_staging is
  'Re-scrape lands here, then catalog.swap_in_staging() promotes it atomically. Not readable by anon/authenticated.';
comment on function catalog.swap_in_staging() is
  'Atomically replaces prop_items with prop_items_staging in one transaction (readers see old rows until commit), then empties staging. Returns rows promoted.';
