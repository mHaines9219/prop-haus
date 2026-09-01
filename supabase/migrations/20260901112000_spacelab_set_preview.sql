-- ============================================================================
-- FUT-2 SPACELAB — generated 3D models + prepared room handoffs
--
-- Two tables with deliberately different shapes, because they answer different
-- questions:
--
--   spacelab_models  — one row PER CATALOG ITEM, shared by every org. A mesh
--                      generated from an item's photo costs money and minutes,
--                      and the item is the same item whoever rents it, so this
--                      is a cache keyed by asset id, not org-scoped data. Reads
--                      are public for the same reason the catalog is: Spacelab
--                      itself fetches the entries cross-origin.
--
--   spacelab_scenes  — one row PER PREPARED ROOM, owned by an org. This one IS
--                      private: it names what a production ordered. Reads are
--                      server-side only (createAdminClient), and Spacelab
--                      fetches it with the bearer token in the column below.
--
-- Access model mirrors orders/certificates: RLS for member reads, writes
-- revoked from authenticated/anon so route handlers resolve org_id from the
-- session rather than the body.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- spacelab_models — the image-to-3D cache
-- ---------------------------------------------------------------------------
create table if not exists public.spacelab_models (
  -- 'prophaus:<source>:<sourceId>'. The id Spacelab's catalog and every
  -- generated room refer to, so it is the natural primary key.
  asset_id           text        primary key,
  source             text        not null,
  source_id          text        not null,
  title              text        not null,
  -- The Prop Haus category, kept alongside the mapped Spacelab one so a
  -- remapping is re-runnable without going back to the catalog.
  category           text,
  spacelab_category  text        not null default 'decor',
  tags               text[]      not null default '{}',
  -- { w, h, d } in METRES. Spacelab is metric; vendor dimensions are inches.
  dims_m             jsonb       not null,
  -- 'vendor' when the listing published dimensions, 'fallback' when they came
  -- from the per-category placeholder table. Lets a later pass regenerate only
  -- the guessed ones once real dimensions land.
  dims_source        text        not null default 'fallback'
                                   check (dims_source in ('vendor','fallback')),
  -- The photo the mesh was generated from. Null for an item with no image.
  image_url          text,
  status             text        not null default 'pending'
                                   check (status in ('pending','ready','failed')),
  -- Which generator made it, so a stale mesh can be traced and re-run.
  provider           text,
  external_job_id    text,
  glb_url            text,
  error_message      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index spacelab_models_source_idx on public.spacelab_models (source, source_id);
create index spacelab_models_status_idx on public.spacelab_models (status);

alter table public.spacelab_models enable row level security;

-- Public reads: the published catalog is fetched by Spacelab (a separate
-- origin, possibly with no session at all) and carries nothing private —
-- item name, size, tags, and a URL to a mesh built from an already-public
-- listing photo. Same posture as vendor_coi_requirements.
create policy "authenticated read spacelab models"
  on public.spacelab_models for select to authenticated using (true);

create policy "anon read spacelab models"
  on public.spacelab_models for select to anon using (true);

revoke insert, update, delete on public.spacelab_models from authenticated, anon;

comment on table public.spacelab_models is
  'Image-to-3D cache: one generated GLB per catalog item, shared across orgs. '
  'Generated once, reused by every order containing that item.';
comment on column public.spacelab_models.dims_m is
  'Real-world size in metres as { w, h, d } — Spacelab catalog dims_m, verbatim.';
comment on column public.spacelab_models.glb_url is
  'Public URL of the mesh. Either a Storage object (SPACELAB_ASSET_BUCKET) or '
  'the regenerating /api/spacelab/models route when no bucket is configured.';

-- ---------------------------------------------------------------------------
-- spacelab_scenes — a prepared room, ready to open
-- ---------------------------------------------------------------------------
create table if not exists public.spacelab_scenes (
  id                 uuid        primary key default gen_random_uuid(),
  org_id             uuid        not null references public.organizations(id) on delete cascade,
  -- Nullable: a room can be prepared from something other than an order later
  -- (a folder, say) without a schema change.
  order_id           uuid        references public.orders(id) on delete cascade,
  -- Bearer capability for the cross-origin fetch. Spacelab is a static app on
  -- another origin with no Prop Haus session, so the room URL carries its own
  -- credential — the same pattern as projects.share_token. Rotating it is
  -- re-preparing the room.
  token              text        not null unique,
  -- The Spacelab SaveFile envelope: { version, scene, next_ids }.
  scene              jsonb       not null,
  item_count         integer     not null default 0,
  -- How many of those items had a mesh when the room was built. The rest are in
  -- the file but will not draw until their model is ready and the room is rebuilt.
  model_ready_count  integer     not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index spacelab_scenes_org_idx on public.spacelab_scenes (org_id);
-- One live room per order: re-preparing updates in place rather than leaking a
-- second token for the same set.
create unique index spacelab_scenes_order_idx
  on public.spacelab_scenes (order_id) where order_id is not null;

alter table public.spacelab_scenes enable row level security;

-- Deliberately NO select policy. Every read is server-side through the service
-- role: the order page renders it, and the Spacelab-facing route authorizes by
-- token. Granting members a direct Data API read would hand them the token
-- column too, which is exactly the leak projects.share_token was hardened
-- against (20260802180000_project_share_token.sql) — and they gain nothing,
-- since the app hands them the room URL when they ask for one.
revoke insert, update, delete on public.spacelab_scenes from authenticated, anon;

comment on table public.spacelab_scenes is
  'A prepared Spacelab room for an order. Read server-side only; Spacelab '
  'fetches it cross-origin with the token as a bearer capability.';
comment on column public.spacelab_scenes.token is
  'Bearer capability for GET /api/spacelab/scenes/<id>. Never exposed through '
  'the Data API — there is no select policy on this table.';
comment on column public.spacelab_scenes.scene is
  'Spacelab SaveFile: { version, scene, next_ids }. Verified against Spacelab''s '
  'own serde types — see lib/spacelab/scene-format.ts.';
