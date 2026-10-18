-- ============================================================================
-- PROJECT — job summary
--
-- A free-text summary of the production, written by the user on the project
-- page (/projects/[id], "Job Summary"). Plain prose for the team's own
-- reference: what the job is, who it is for, what matters. Independent of
-- projects.profile, the structured record the paperwork engine reads.
--
-- No RLS changes: projects keeps its org-scoped policies and service-role
-- writes from 20260829130000_strip_workflow_to_folders.sql.
-- ============================================================================

alter table public.projects
  add column summary text not null default ''
    check (char_length(summary) <= 4000);

comment on column public.projects.summary is
  'User-written job summary shown on the project page. Free text, up to 4000 characters.';
