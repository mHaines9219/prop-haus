-- ============================================================================
-- Project paperwork checklist (MVP-13).
--
-- projects.profile            the structured project profile the intake
--                             conversation builds (lib/project-profile.ts).
--                             jsonb like organizations.order_profile: the
--                             shape is validated in code, not the schema.
-- project_intake_messages     the intake transcript. Context for the next
--                             turn, never the source of truth: a fact counts
--                             only once it is on projects.profile.
-- project_requirements        what the user has done about one requirement
--                             on one project: attached a document, marked it
--                             requested, or marked it not applicable. The
--                             requirement ids come from
--                             lib/requirements/library.ts.
--
-- Access model matches the rest of the projects schema: org members read via
-- the owning project, all writes through the service role after the route
-- handler has checked session + org.
-- ============================================================================

alter table public.projects
  add column if not exists profile jsonb not null default '{}';

comment on column public.projects.profile is
  'Structured project profile built by intake (lib/project-profile.ts). Read by the requirements engine and template prefill.';

-- ---------------------------------------------------------------------------
-- project_intake_messages
-- ---------------------------------------------------------------------------
create table public.project_intake_messages (
  id             uuid        primary key default gen_random_uuid(),
  project_id     text        not null references public.projects(id) on delete cascade,
  role           text        not null check (role in ('user', 'assistant')),
  content        text        not null,
  -- Profile gap keys the assistant asked about, so a one-word answer routes back.
  question_keys  jsonb       not null default '[]',
  created_at     timestamptz not null default now()
);

create index project_intake_messages_project_idx
  on public.project_intake_messages (project_id, created_at);

alter table public.project_intake_messages enable row level security;

create policy "members read org intake messages" on public.project_intake_messages
  for select to authenticated
  using (project_id in (
    select id from public.projects
    where org_id in (select private.current_user_org_ids())
  ));

revoke insert, update, delete on public.project_intake_messages from authenticated, anon;

comment on table public.project_intake_messages is
  'Intake conversation for a project. Context for the model; never the source of truth for project facts.';

-- ---------------------------------------------------------------------------
-- project_requirements
-- ---------------------------------------------------------------------------
create table public.project_requirements (
  id              uuid        primary key default gen_random_uuid(),
  project_id      text        not null references public.projects(id) on delete cascade,
  requirement_id  text        not null,
  status          text        not null check (status in ('attached', 'awaiting', 'not_applicable')),
  document_id     uuid        references public.project_documents(id) on delete set null,
  updated_at      timestamptz not null default now(),
  unique (project_id, requirement_id)
);

create index project_requirements_project_idx on public.project_requirements (project_id);
create index project_requirements_document_idx on public.project_requirements (document_id);

alter table public.project_requirements enable row level security;

create policy "members read org project requirements" on public.project_requirements
  for select to authenticated
  using (project_id in (
    select id from public.projects
    where org_id in (select private.current_user_org_ids())
  ));

revoke insert, update, delete on public.project_requirements from authenticated, anon;

comment on table public.project_requirements is
  'User state for one requirement on one project. requirement_id is a lib/requirements/library.ts id. '
  'attached: document_id satisfies it (a deleted document sets it null and the item reads as missing again). '
  'awaiting: requested from a vendor, client, broker, or office. not_applicable: the user waved it off.';
