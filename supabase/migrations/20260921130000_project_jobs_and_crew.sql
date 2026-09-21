-- ============================================================================
-- PROJECT JOBS + CREW — orders and crew requests belong to a project
--
-- The Dashboard is Projects only (Sep 2026). What the /jobs board showed
-- (orders in flight, crew requested) now lives on the project page, in a
-- JOBS section and a CREW section beside SCENES and PAPERWORK. Both tables
-- gain a nullable `project_id`:
--
--   orders.project_id         set at checkout from the cart's project picker
--   crew_requests.project_id  set by the request form (/crew?project=<id>)
--
-- Nullable on purpose: orders placed before this migration, and requests
-- made without picking a project, stay valid and keep showing on /orders.
-- `on delete set null` so deleting a project never deletes its history.
--
-- No RLS changes: both tables keep their org-scoped SELECT policies. Ownership
-- of the project is checked server-side (lib/projects getProject) before a
-- project_id is written, so a client cannot attach work to another org's
-- project by guessing an id.
-- ============================================================================

alter table public.orders
  add column project_id uuid references public.projects(id) on delete set null;

create index orders_project_idx on public.orders (project_id);

comment on column public.orders.project_id is
  'The production this order was placed for. Null for orders placed without a project.';

alter table public.crew_requests
  add column project_id uuid references public.projects(id) on delete set null;

create index crew_requests_project_idx on public.crew_requests (project_id);

comment on column public.crew_requests.project_id is
  'The production this crew request is for. Null when requested without a project.';
