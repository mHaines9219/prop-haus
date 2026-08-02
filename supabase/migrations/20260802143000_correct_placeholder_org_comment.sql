-- ============================================================================
-- Correct the comment on public.organizations. Two claims in
-- 20260802013000_seed_placeholder_org.sql stopped being true, and one of them
-- was never true.
--
-- WHY A NEW MIGRATION RATHER THAN AN EDIT
--
-- `comment on table` is applied state, not documentation: the old text is live
-- in the database right now and PostgREST publishes it in the OpenAPI spec, so
-- anyone reading the API sees it. Editing the original file would fix the repo
-- and leave the database saying the wrong thing -- and rewriting an applied
-- migration is what produced the phantom-version drift that had to be repaired
-- earlier in this project.
--
-- CLAIM 1, now stale. The old comment says the placeholder is what
-- `lib/session.ts` "returns until auth is wired". Auth is wired:
-- `currentOrgId()` reads the real Supabase session, and `/api/search` requires
-- one. No application code references the placeholder id any more. The row is
-- historical -- it may still own events and usage counters recorded before
-- sessions existed, which is why it is not being deleted here.
--
-- CLAIM 2, wrong when written -- mine, caught by Bumble. The old header said
-- "delete it once real sessions exist" and that every referencing table is
-- `on delete cascade` or `on delete set null`, so one delete would clean up
-- after itself. It is not true. `public.profiles.org_id`
-- (20260627181123_init_accounts.sql:47) carries NO on-delete clause, so it
-- defaults to NO ACTION:
--
--   profiles.org_id          -> organizations(id)   NO ACTION   <- blocks delete
--   memberships.org_id       -> organizations(id)   cascade
--   org_vendor_accounts      -> organizations(id)   cascade
--   usage_counters.org_id    -> organizations(id)   cascade
--   documents.org_id         -> organizations(id)   cascade
--   events.org_id            -> organizations(id)   set null
--   projects.org_id          -> organizations(id)   cascade
--
-- So deleting an organization is REFUSED while any profile still points at it.
-- Demonstrated against the live database rather than read off the DDL, because
-- the claim being corrected was itself an unverified reading:
--
--   DELETE organizations WHERE id = <org with a profile>
--     -> 409  SQLSTATE 23503
--        "Key (id)=(...) is still referenced from table \"profiles\""
--     -> row still present afterwards
--   DELETE the same org AFTER removing its user
--     -> 204
--
-- Removing an org means removing its users first. Related, and deliberately not
-- fixed here because it is a schema decision rather than a comment: deleting an
-- auth user cascades away their profile and membership but leaves the
-- organization `handle_new_user()` created for them, named after their email.
-- ============================================================================

comment on table public.organizations is
  'Billing/ownership unit; one org per user, created by handle_new_user(). '
  'Contains one historical placeholder row (00000000-0000-0000-0000-0000000000aa) '
  'seeded before auth was wired -- no application code references it now, but it '
  'may own pre-auth events and usage counters. Deleting an organization is '
  'REFUSED while any profile still references it (profiles.org_id is NO ACTION); '
  'remove its users first.';
