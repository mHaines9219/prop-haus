-- The Directory tier ($29: Browse plus the house behind every piece).
-- organizations.plan gains a third value; lib/accounts.ts PLAN_TIERS and
-- lib/plans.ts entitlements list the same three. The column stays
-- service-role only (billing webhook), unchanged from init_accounts.
alter table public.organizations
  drop constraint if exists organizations_plan_check;

alter table public.organizations
  add constraint organizations_plan_check
  check (plan in ('free', 'directory', 'pro'));
