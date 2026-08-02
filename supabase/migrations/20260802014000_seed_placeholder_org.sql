-- ============================================================================
-- Prop Haus — seed the placeholder organization
--
-- `lib/session.ts` returns a fixed `PLACEHOLDER_ORG_ID` until real sessions
-- exist. The file-backed stores have no foreign keys, so that id never needed
-- to correspond to anything. Postgres does:
--
--   projects.org_id       not null references organizations(id)
--   usage_counters.org_id not null references organizations(id)
--
-- So the moment `lib/projects.ts` or `lib/usage.ts` writes to Postgres, every
-- insert fails the FK — not because the port is wrong, but because the owner it
-- names is not a row. That would read as "the Postgres port is broken" when the
-- actual gap is one missing organization.
--
-- Seeding it here decouples two things that otherwise look coupled: the ports
-- can land before the login page, in either order, instead of waiting on auth.
--
-- This is a placeholder and it should not outlive auth. Once `currentOrgId()`
-- reads a real session, delete this row — every project it owns goes with it
-- via `on delete cascade`, which is the correct behaviour for throwaway
-- pre-auth data:
--
--   delete from public.organizations
--   where id = '00000000-0000-0000-0000-0000000000aa';
--
-- The name is deliberately unmistakable in any UI that renders it, so a
-- placeholder org can never be quietly mistaken for a customer.
-- ============================================================================

insert into public.organizations (id, type, name, plan, metadata)
values (
  '00000000-0000-0000-0000-0000000000aa',
  'personal',
  '[placeholder] Pre-auth shared workspace',
  'free',
  jsonb_build_object(
    'placeholder', true,
    'note', 'Seeded by 20260802014000. Delete once lib/session.ts reads a real session.'
  )
)
on conflict (id) do nothing;

comment on table public.organizations is
  'Tenant root. Contains one seeded placeholder row (…0000aa) that backs lib/session.ts PLACEHOLDER_ORG_ID until auth is wired; remove it when sessions are real.';
