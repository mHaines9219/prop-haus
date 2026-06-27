-- ============================================================================
-- Documentation: table + column comments so the schema is self-explanatory in
-- the Supabase dashboard and via introspection (\d+ / information_schema).
-- ============================================================================

-- organizations -------------------------------------------------------------
comment on table public.organizations is
  'An account/workspace. Every user belongs to exactly one org. Freelancers get a ''personal'' org-of-one; teams use ''company''. Vendor relationships, insurance, billing plan, and projects all hang off the org — never off the individual user.';
comment on column public.organizations.type is
  '''personal'' = freelancer org-of-one | ''company'' = team with multiple members.';
comment on column public.organizations.name is
  'Business name. For a personal org, defaults to the user''s own name.';
comment on column public.organizations.plan is
  'Billing/gating tier. NOT client-writable (column grant excludes it) — only the billing webhook via the service role may change it. Which features each tier unlocks is defined in code (lib/plans.ts), not here.';
comment on column public.organizations.insurance is
  'JSONB InsurancePolicy — the org''s insurance/COI profile (carrier, limits, endorsements, dates).';
comment on column public.organizations.production_types is
  'Optional firmographics for segmentation/upsell. Captured progressively after signup — never gate entry on these.';
comment on column public.organizations.markets is
  'City slugs the org works in, e.g. {LA}. Progressive-profiling field.';
comment on column public.organizations.annual_project_volume is
  'Banded project volume for segmentation. Progressive-profiling field.';
comment on column public.organizations.typical_budget_band is
  'Banded typical budget for segmentation. Progressive-profiling field.';
comment on column public.organizations.metadata is
  'JSONB escape hatch for soft, rarely-queried attributes — add fields here without a migration.';

-- profiles -------------------------------------------------------------------
comment on table public.profiles is
  '1:1 with auth.users — app-level user data. Identity & credentials (email, password, login method) are owned by Supabase Auth; this table holds profile + onboarding fields only. Auto-created by the on_auth_user_created trigger on signup.';
comment on column public.profiles.id is
  'Equals auth.users.id. No password is ever stored here.';
comment on column public.profiles.org_id is
  'The org this user belongs to (personal or company). Set by the signup trigger; not user-editable.';
comment on column public.profiles.email is
  'Mirrored from auth.users for convenient joins; auth remains the source of truth.';
comment on column public.profiles.profession is
  'The user''s job title / profession (the "role" collected at onboarding). DISTINCT from memberships.role, which is a permission level.';
comment on column public.profiles.heard_about_us is
  'Signup attribution channel. Pair with heard_about_us_detail for free-text specifics.';
comment on column public.profiles.onboarded_at is
  'NULL until the onboarding form is completed — useful for the activation funnel.';

-- memberships ----------------------------------------------------------------
comment on table public.memberships is
  'Join table linking users to orgs. A user can belong to multiple orgs; (org_id, user_id) is the primary key. This is where org permissions live.';
comment on column public.memberships.role is
  'PERMISSION role within the org: owner | admin | member. NOT the user''s profession (see profiles.profession).';

-- org_vendor_accounts --------------------------------------------------------
comment on table public.org_vendor_accounts is
  'One row per (org, vendor) relationship — an org''s standing with a prop house. Modeled as ROWS (not a column per vendor) so onboarding a new vendor needs zero schema change.';
comment on column public.org_vendor_accounts.vendor is
  'Vendor slug, validated against SOURCES in app code (lib/types.ts) — intentionally not a DB enum, so adding a vendor is data, not a migration.';
comment on column public.org_vendor_accounts.status is
  '''claimed'' = org self-reported | ''verified'' = platform-confirmed with the vendor | ''rejected''. Promotion to ''verified'' should be done server-side only.';
comment on column public.org_vendor_accounts.account_ref is
  'The org''s account number / login email with that vendor, if any.';
comment on column public.org_vendor_accounts.coi_on_file is
  'Hook into the COI flow: when true, project creation can skip COI re-collection for this vendor.';

-- usage_counters -------------------------------------------------------------
comment on table public.usage_counters is
  'Metered usage backing plan limits (e.g. lifetime vision-search trial, monthly AI searches). SERVER-WRITTEN ONLY (service role) — clients cannot insert/update, which prevents paywall bypass. The limits themselves live in code (lib/plans.ts), not here.';
comment on column public.usage_counters.period is
  '''lifetime'' for lifetime metrics, or ''YYYY-MM'' for monthly-resetting metrics.';
comment on column public.usage_counters.metric is
  'Metered metric key, e.g. ''visionSearches'' (lifetime trial) or ''aiSearchesPerMonth''. Mirrors lib/plans.ts.';
comment on column public.usage_counters.count is
  'Usage counted UP (not "remaining"). Remaining = plan limit - count, where the limit comes from lib/plans.ts. Counting up means changing the limit needs no backfill.';

-- documents ------------------------------------------------------------------
comment on table public.documents is
  'Metadata for sensitive uploaded documents (W9s, COIs). The files themselves live in the PRIVATE ''documents'' Storage bucket; this table only tracks them. Access to the bytes is via short-lived signed URLs minted server-side, never public links.';
comment on column public.documents.kind is
  '''w9'' | ''coi'' | ''other''.';
comment on column public.documents.vendor is
  'For COIs tied to a specific vendor relationship; null otherwise.';
comment on column public.documents.storage_path is
  'Path within the private ''documents'' bucket. The FIRST path segment MUST be the org_id — Storage RLS authorizes on it (see lib/documents.ts documentStoragePath()).';
comment on column public.documents.status is
  '''uploaded'' | ''verified'' | ''rejected'' | ''expired''. Promotion to ''verified'' is server-side only.';
comment on column public.documents.expires_at is
  'Expiration of the document where applicable, e.g. a COI''s expiration date.';

-- events ---------------------------------------------------------------------
comment on table public.events is
  'Append-only analytics / intent log (searches, zero-result searches, cart abandons, paywall hits, etc.). SERVER-WRITTEN ONLY (service role) so analytics can''t be forged. An event STREAM — new event types need no migration.';
comment on column public.events.type is
  'Event type string; see EVENT_TYPES in lib/events.ts.';
comment on column public.events.payload is
  'JSONB event-specific data (e.g. { feature } for paywall_hit, { query, resultCount } for search).';
comment on column public.events.org_id is
  'Org the event belongs to; nullable (set null on org delete) so the log survives org deletion.';
