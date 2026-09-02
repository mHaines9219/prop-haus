-- ============================================================================
-- Projects become a multi-folder system.
--
-- Before: one `projects` row WAS a folder — a flat list of saved items.
-- After:  a `projects` row is a production. It owns many `project_folders`:
--   * kind = 'scene'      — any number, user-named ("Sc. 12 diner", "Apt int.").
--                            Saved catalog items and web clips live here.
--   * kind = 'paperwork'  — exactly one per project, seeded on create.
--                            Uploaded documents (COIs, W9s, invoices, call
--                            sheets, deal memos) live here, in a private
--                            storage bucket.
--
-- Why: productions shoot many scenes, and set decorators sort their pulls by
-- scene. A single flat folder per production forced them to mix everything
-- together, and gave paperwork nowhere to go at all.
--
-- Access model is unchanged from 20260829130000_strip_workflow_to_folders.sql:
-- RLS read for org members via the owning project, all writes via the service
-- role after the route handler has checked session + org.
--
-- Backfill: every existing project gets a "Scene 1" folder holding whatever it
-- already had, plus an empty "Paperwork" folder. Nothing is dropped.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- project_folders
-- ---------------------------------------------------------------------------
create table public.project_folders (
  id          uuid primary key default gen_random_uuid(),
  project_id  text not null references public.projects(id) on delete cascade,
  name        text not null,
  kind        text not null default 'scene'
                check (kind in ('scene', 'paperwork')),
  -- Display order among a project's scene folders. Ties break on created_at.
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  metadata    jsonb not null default '{}'
);

create index project_folders_project_idx on public.project_folders (project_id, position);

-- One paperwork folder per project, enforced in the schema rather than in code.
create unique index project_folders_one_paperwork
  on public.project_folders (project_id)
  where kind = 'paperwork';

alter table public.project_folders enable row level security;

create policy "members read org project folders" on public.project_folders
  for select to authenticated
  using (project_id in (
    select id from public.projects
    where org_id in (select private.current_user_org_ids())
  ));

revoke insert, update, delete on public.project_folders from authenticated, anon;

comment on table public.project_folders is
  'A folder inside a project (production). kind=scene holds saved items; kind=paperwork (one per project) holds uploaded documents.';
comment on column public.project_folders.kind is
  'scene | paperwork. A project has any number of scene folders and exactly one paperwork folder.';
comment on column public.project_folders.position is
  'Display order among scene folders, ascending. Ties break on created_at.';

-- ---------------------------------------------------------------------------
-- Backfill: one scene folder + one paperwork folder per existing project.
-- ---------------------------------------------------------------------------
insert into public.project_folders (project_id, name, kind, position, created_at, updated_at)
select id, 'Scene 1', 'scene', 0, created_at, updated_at from public.projects;

insert into public.project_folders (project_id, name, kind, position, created_at, updated_at)
select id, 'Paperwork', 'paperwork', 0, created_at, updated_at from public.projects;

-- ---------------------------------------------------------------------------
-- project_items now belong to a folder. project_id stays as a denormalized
-- column so the org-scoping join in RLS is one hop, same as before.
-- ---------------------------------------------------------------------------
alter table public.project_items
  add column folder_id uuid references public.project_folders(id) on delete cascade;

update public.project_items i
set folder_id = f.id
from public.project_folders f
where f.project_id = i.project_id and f.kind = 'scene';

alter table public.project_items alter column folder_id set not null;

-- The same catalog item may legitimately be pulled for two scenes, so the
-- dedupe key moves from (project, item) to (folder, item).
alter table public.project_items drop constraint if exists project_items_project_id_item_id_key;
alter table public.project_items add constraint project_items_folder_id_item_id_key unique (folder_id, item_id);

create index project_items_folder_idx on public.project_items (folder_id);

comment on column public.project_items.folder_id is
  'The scene folder this item was saved into. Items never live in a paperwork folder.';
comment on column public.project_items.project_id is
  'Denormalized from the folder for the RLS org-scoping join. Always equals project_folders.project_id.';

-- ---------------------------------------------------------------------------
-- project_documents — one row per file uploaded into a paperwork folder.
-- The bytes live in the private 'paperwork' storage bucket at storage_path;
-- first path segment = org_id so storage RLS can scope by org.
-- ---------------------------------------------------------------------------
create table public.project_documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    text not null references public.projects(id) on delete cascade,
  folder_id     uuid not null references public.project_folders(id) on delete cascade,
  name          text not null,
  storage_path  text not null,
  mime          text not null,
  size_bytes    bigint not null check (size_bytes >= 0),
  uploaded_at   timestamptz not null default now(),
  metadata      jsonb not null default '{}'
);

create index project_documents_folder_idx on public.project_documents (folder_id);
create index project_documents_project_idx on public.project_documents (project_id);

alter table public.project_documents enable row level security;

create policy "members read org project documents" on public.project_documents
  for select to authenticated
  using (project_id in (
    select id from public.projects
    where org_id in (select private.current_user_org_ids())
  ));

revoke insert, update, delete on public.project_documents from authenticated, anon;

comment on table public.project_documents is
  'A file uploaded into a project''s paperwork folder. Bytes live in the private paperwork bucket at storage_path; downloads go through short-lived signed URLs minted server-side.';

-- ---------------------------------------------------------------------------
-- Storage: private 'paperwork' bucket. Uploads and signed-URL downloads are
-- server-side (service role); members get a read policy scoped by the org id
-- in the first path segment so a future client-side viewer needs no migration.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('paperwork', 'paperwork', false)
on conflict (id) do nothing;

create policy "members read org paperwork" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'paperwork'
    and (storage.foldername(name))[1] in (select id::text from private.current_user_org_ids() id)
  );

-- ---------------------------------------------------------------------------
-- projects: now a production that owns folders, not a folder itself.
-- ---------------------------------------------------------------------------
comment on table public.projects is
  'A production (project). Owns scene folders of saved items and one paperwork folder of uploaded documents. Owned by an organization.';
comment on column public.projects.name is 'User-chosen production name.';
