-- ============================================================================
-- DASHBOARD — user-assigned status on projects
--
-- The Dashboard (/projects) shows one row per production. This column is the
-- user's own tag for where that production sits on their board, set by hand
-- from the row's status control and filtered on by the table's facet tabs:
--
--   active   working it now (default for every new project)
--   pending  parked, waiting on something outside the platform
--   done     wrapped; stays visible under the Done filter
--
-- Independent of orders.job_status (the per-order tag inside a project's Jobs
-- section) and of the vendor-driven orders.status lifecycle.
--
-- No RLS changes: projects keeps its org-scoped policies and service-role
-- writes from 20260829130000_strip_workflow_to_folders.sql.
-- ============================================================================

alter table public.projects
  add column status text not null default 'active'
    check (status in ('active','pending','done'));

create index projects_status_idx on public.projects (org_id, status);

comment on column public.projects.status is
  'User-assigned Dashboard status: active | pending | done. Set by hand from /projects.';
