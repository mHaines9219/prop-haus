-- ============================================================================
-- Seed the placeholder organization that `currentOrgId()` returns until auth
-- is wired.
--
-- WHY THIS IS NOT OPTIONAL, AND WHY IT FAILS SILENTLY WITHOUT IT
--
-- lib/session.ts returns PLACEHOLDER_ORG_ID for every request while there is no
-- sign-in flow. Six tables carry `org_id ... references public.organizations(id)`,
-- so an id with no matching row violates a foreign key on every insert.
--
-- The one that bites first is `public.events`. lib/analytics.ts `recordEvents`
-- deliberately catches every error and warns rather than throwing, because
-- analytics must never turn a working search into a 502. That decision is right.
-- Combined with a dangling org id it produces the worst possible shape: every
-- search, vision_search, zero_result_search and paywall_hit hits
-- `events_org_id_fkey`, gets swallowed, and the events table stays empty while
-- the app looks perfectly healthy. The demand signal the product brief leans on
-- to validate the whole thesis would record nothing, and the only symptom would
-- be a warning in a log nobody reads.
--
-- Found by Bumble, who reproduced the violation against the live database
-- rather than inferring it. Neither PR is wrong alone: the placeholder and the
-- event writes only meet once both are on main, which is why no typecheck or
-- test caught it — the combination did not exist in any single tree.
--
-- CHOSEN OVER writing `org_id: null`. Null-org events do insert, but they cannot
-- be attributed, and re-attributing them later means a backfill over rows that
-- never knew who they belonged to.
--
-- REMOVING THIS LATER: delete the row. Every referencing table is either
-- `on delete cascade` or `on delete set null`, so one delete cleans up all
-- placeholder-era data with it. Real organizations come from the
-- `handle_new_user()` trigger with generated uuids and cannot collide with this
-- fixed one.
-- ============================================================================

insert into public.organizations (id, type, name, plan)
values (
  '00000000-0000-0000-0000-0000000000aa',  -- lib/session.ts PLACEHOLDER_ORG_ID
  'company',
  'Placeholder Org (pre-auth)',
  'free'
)
on conflict (id) do nothing;

comment on table public.organizations is
  'Billing/ownership unit. Contains one seeded placeholder row '
  '(00000000-0000-0000-0000-0000000000aa) that lib/session.ts returns until auth '
  'is wired; delete it once real sessions exist.';
