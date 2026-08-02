-- ============================================================================
-- projects.share_token — a revocable, read-only capability for the proposal
--
-- WHY THIS EXISTS
--
-- Until now the project id WAS the sharing mechanism: /projects/<id>/proposal
-- and its CSV export were deliberately not org-scoped, so a production could
-- forward the link to a client. That works exactly once. It cannot be revoked
-- without deleting the project, it grants the same reach as the owner's own
-- URL, and it is the same id that appears in every owner-only route.
--
-- A separate token separates looking from acting. Same pattern as
-- vendor_requests.token (20260802003000_workflow_projects.sql:101), for the
-- same reason: a bearer credential for a route that has no session to check.
--
-- LAZY, NOT DEFAULTED. No default and no backfill: a project that has never
-- been shared has share_token null. A token minted at creation would be a
-- credential nobody chose to issue, live from the moment the row exists.
-- Revocation is `set share_token = null`, and re-sharing mints a new one — so
-- "revoke and reissue" costs nothing extra.
--
-- `unique` gives the lookup index for free. Postgres permits many nulls under a
-- unique constraint, which is what makes lazy minting workable — the common
-- case is an unshared project and they do not collide with each other.
--
-- SAFE TO APPLY UNDER LOAD. Adding a nullable column with no default is a
-- catalog-only change in PostgreSQL 11+: no table rewrite, no backfill, and the
-- unique index is built over the ~1 row that is non-null. This is the opposite
-- shape to the keyword_tsv backfill that saturated I/O — nothing here touches
-- existing rows.
-- ============================================================================

alter table public.projects
  add column share_token text unique;

comment on column public.projects.share_token is
  'Bearer capability for /proposal/<token>. Null until the owner shares; set to '
  'null to revoke. Never exposed through the Data API — see the column grant below.';

-- ---------------------------------------------------------------------------
-- Keep the token off the Data API.
--
-- Directly mirrors the treatment vendor_requests.token gets. `authenticated`
-- can already read their own projects through the "members read org projects"
-- policy, and a member reading their own project has no use for the raw token —
-- the app hands them a share URL when they ask for one. Leaving it selectable
-- would mean any org member could lift a live client-facing credential straight
-- out of the Data API, and any future policy widening would leak it silently.
--
-- Server-side reads use the service role, which ignores column grants, so
-- getProjectByShareToken() is unaffected.
--
-- Every non-token column is enumerated deliberately: `grant select (...)` has no
-- "all except" form, so a column added later is NOT granted until someone adds
-- it here. That fails closed — a new column is invisible rather than a new token
-- being readable.
-- ---------------------------------------------------------------------------
revoke select on public.projects from authenticated, anon;

grant select (
  id, org_id, status, production_name, production_type,
  start_date, end_date, delivery_address,
  contact_name, contact_email, contact_phone,
  budget, notes, insured, approved_at, archived_at,
  created_at, updated_at, metadata
) on public.projects to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK, if this ever needs reverting:
--
--   revoke select on public.projects from authenticated;
--   grant  select on public.projects to authenticated;   -- restores all columns
--   alter table public.projects drop column share_token;
--
-- Order matters: dropping the column first leaves the explicit column grant
-- referencing a column that no longer exists. Same class of hazard as the
-- keyword_tsv trigger — revert the dependent object before the thing it names.
-- ---------------------------------------------------------------------------
