-- ============================================================================
-- MVP re-scope: drop the vendor-coordination / COI / document workflow, and
-- collapse `projects` from a vendor-quote-and-approval object down to a plain
-- saved-items folder.
--
-- What's leaving, and why it's safe to drop rather than migrate:
--   * vendor_requests, line_items — the quote/availability/COI-per-vendor
--     workflow. No vendor portal ships in this version of the app, so nothing
--     ever writes or reads these again.
--   * documents — W9/COI file metadata. lib/documents.ts had zero importers
--     before it was deleted; the private 'documents' storage bucket is dropped
--     with it.
--   * org_vendor_accounts — vendor account claiming/verification. Never had a
--     single call site outside its own type definition.
--   * organizations.insurance — the org's InsurancePolicy. Insurance/COI
--     tracking isn't part of this app anymore.
--   * projects.* workflow columns (status, production_type, dates, delivery/
--     contact fields, budget, notes, insured, approved_at, share_token) — all
--     belonged to the "submit a request, vendors quote, approve a proposal"
--     flow. What's left is a folder: id, org, name, archived, timestamps.
--
-- Replacing it: project_items, one row per catalog item saved into a folder.
-- Same access model as before (RLS read for org members, all writes via the
-- service role — the route handler checks session/org membership up front).
--
-- Pre-launch schema with no real rows riding on any of this, so straight
-- drops rather than a deprecate-then-backfill dance.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Vendor-coordination workflow tables
-- ---------------------------------------------------------------------------
drop table if exists public.line_items;
drop table if exists public.vendor_requests;

-- ---------------------------------------------------------------------------
-- Documents (W9/COI metadata) + its storage bucket
-- ---------------------------------------------------------------------------
delete from storage.objects where bucket_id = 'documents';
delete from storage.buckets where id = 'documents';
drop table if exists public.documents;

-- ---------------------------------------------------------------------------
-- Vendor account claiming — dead table, no code path ever wrote to it.
-- ---------------------------------------------------------------------------
drop table if exists public.org_vendor_accounts;

-- ---------------------------------------------------------------------------
-- organizations.insurance
-- ---------------------------------------------------------------------------
alter table public.organizations drop column if exists insurance;

-- ---------------------------------------------------------------------------
-- projects — collapse to a folder: id, org_id, name, archived_at, timestamps.
-- ---------------------------------------------------------------------------
alter table public.projects drop constraint if exists projects_dates_ordered;

alter table public.projects
  drop column if exists status,
  drop column if exists production_type,
  drop column if exists start_date,
  drop column if exists end_date,
  drop column if exists delivery_address,
  drop column if exists contact_name,
  drop column if exists contact_email,
  drop column if exists contact_phone,
  drop column if exists budget,
  drop column if exists notes,
  drop column if exists insured,
  drop column if exists approved_at,
  drop column if exists share_token;

alter table public.projects rename column production_name to name;

comment on table public.projects is
  'A folder: a named collection of saved catalog items, owned by an organization.';
comment on column public.projects.name is 'User-chosen folder name.';
comment on column public.projects.archived_at is
  'Soft-hidden from the folder list when set. Orthogonal to nothing now — no status enum left to interact with.';

-- Re-grant column select now that the column set changed. Same begin/commit
-- shape as 20260802180000: this is a live failure window (see that file for
-- why), not decoration.
begin;

revoke select on public.projects from authenticated, anon;

grant select (id, org_id, name, archived_at, created_at, updated_at, metadata)
  on public.projects to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- project_items — one row per catalog item saved into a folder.
--
-- item_id/source/source_id/name/image/source_url/category are snapshotted
-- from the catalog at save time (same rationale line_items used to have: a
-- folder must survive the source item being de-listed on a re-scrape).
-- ---------------------------------------------------------------------------
create table public.project_items (
  id          uuid primary key default gen_random_uuid(),
  project_id  text not null references public.projects(id) on delete cascade,
  item_id     text not null,
  source      text not null,
  source_id   text not null,
  name        text not null,
  image       text,
  source_url  text not null,
  category    text,
  added_at    timestamptz not null default now(),
  metadata    jsonb not null default '{}',
  unique (project_id, item_id)
);

create index project_items_project_idx on public.project_items (project_id);

alter table public.project_items enable row level security;

create policy "members read org project items" on public.project_items
  for select to authenticated
  using (project_id in (
    select id from public.projects
    where org_id in (select private.current_user_org_ids())
  ));

revoke insert, update, delete on public.project_items from authenticated, anon;

comment on table public.project_items is
  'A catalog item saved into a folder (public.projects). Snapshot fields so a folder survives the source item being de-listed on a re-scrape.';
