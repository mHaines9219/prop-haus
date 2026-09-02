-- ============================================================================
-- MVP-10: the order profile — everything one-click checkout needs, on the org.
--
-- organizations.checkout_profile (production name, contact, default window)
-- and organizations.insurance_profile (limits, expiry) fold into a single
-- organizations.order_profile jsonb, typed as OrderProfile in
-- lib/order-profile.ts:
--   company        legal name, DBA, entity type, address, billing address
--   contacts       ordering contact, accounts-payable contact
--   defaults       rental window days, delivery address, delivery notes
--   insurance      the production's OWN coverage: carrier, policy, limits,
--                  expiry, broker, and the COI PDF they uploaded (a pointer
--                  into the private paperwork bucket)
--   authorization  the org's recorded consent for Prop Haus to complete
--                  vendor forms and send vendor requests with this data
--
-- Tax IDs (EIN) are deliberately NOT stored here. MVP-12 decides per form
-- whether one is needed and, if so, collects it at sign time through Anvil
-- rather than persisting it on the org.
--
-- orders.delivery_address snapshots the resolved address at checkout so
-- later emails and forms read the order, not the live profile.
-- ============================================================================

alter table public.organizations
  add column if not exists order_profile jsonb not null default '{}';

comment on column public.organizations.order_profile is
  'One-click order defaults, typed as OrderProfile in lib/order-profile.ts: '
  '{ company, contacts, defaults, insurance, authorization }. Insurance is the '
  'production''s own coverage as their broker issued it; Prop Haus is never the '
  'insurer or broker. No tax IDs live here.';

-- Carry the old columns' values across. jsonb_strip_nulls drops the keys that
-- had nothing to carry, so a never-filled org ends up with an honest '{}'-ish
-- profile rather than a scaffold of nulls.
update public.organizations
set order_profile = jsonb_strip_nulls(jsonb_build_object(
  'company', jsonb_build_object(
    'legalName', coalesce(checkout_profile->>'productionName', insurance_profile->>'namedInsured')
  ),
  'contacts', jsonb_build_object(
    'ordering', jsonb_build_object(
      'name',  checkout_profile->>'contactName',
      'email', checkout_profile->>'contactEmail',
      'phone', checkout_profile->>'contactPhone'
    )
  ),
  'defaults', jsonb_build_object(
    'rentalWindowDays', checkout_profile->'defaultRentalWindowDays'
  ),
  'insurance', jsonb_build_object(
    'policyNumber',               insurance_profile->>'policyRef',
    'glLimit',                    insurance_profile->'glLimit',
    'aggregateLimit',             insurance_profile->'aggregateLimit',
    'workersCompLimit',           insurance_profile->'workersCompLimit',
    'additionalInsuredAvailable', insurance_profile->'additionalInsuredAvailable',
    'expiresAt',                  insurance_profile->>'expiresAt'
  ),
  'authorization', jsonb_build_object('formsOnBehalf', false)
))
where checkout_profile <> '{}'::jsonb or insurance_profile is not null;

alter table public.organizations
  drop column if exists checkout_profile,
  drop column if exists insurance_profile;

-- Writes go through the service role in route handlers (org id from the
-- session, never the body), so no column grant to authenticated is needed.

alter table public.orders
  add column if not exists delivery_address jsonb;

comment on column public.orders.delivery_address is
  'Delivery address resolved at checkout (body override or profile default), '
  'snapshotted so outreach emails and forms read the order, not the live profile. '
  'Shape: { line1, line2?, city, state, zip }.';
