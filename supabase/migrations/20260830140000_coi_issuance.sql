-- ============================================================================
-- MVP-4: COI issuance via insurance API partner.
--
-- Restores the org insurance profile column (dropped in
-- 20260829130000_strip_workflow_to_folders.sql) in a new, more deliberate shape.
-- Adds:
--   * organizations.insurance_profile jsonb — the org's coverage data.
--   * vendor_coi_requirements — per-vendor requirements, editable by ops.
--   * certificates — issued COI records, org-scoped with RLS.
--
-- Division of responsibility (reflected in UI copy):
--   The PARTNER underwrites, binds, and issues coverage.
--   Prop Haus is the workflow, data, and integration layer.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Insurance profile on the org
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists insurance_profile jsonb;

comment on column public.organizations.insurance_profile is
  'The org''s insurance coverage profile as known to Prop Haus. '
  'Shape: { namedInsured, glLimit, aggregateLimit, workersCompLimit?, '
  'additionalInsuredAvailable, policyRef?, expiresAt? }. '
  'Not a policy — this is the data the COI partner needs to issue certificates. '
  'Prop Haus is NOT the insurer.';

-- Grant read access (plan column was already restricted; same pattern)
-- Members can read their own org's profile; only the server role writes it.
-- The existing "org members read their orgs" policy covers this column already
-- since it was added via an unscoped ALTER TABLE. No additional policy needed.

-- ---------------------------------------------------------------------------
-- vendor_coi_requirements — seeded by ops, read by the app
-- ---------------------------------------------------------------------------
create table if not exists public.vendor_coi_requirements (
  vendor_id                   text primary key,
  vendor_name                 text not null,
  gl_limit                    integer not null default 1000000,
  aggregate_limit             integer not null default 2000000,
  workers_comp_required       boolean not null default false,
  additional_insured_required boolean not null default true,
  notes                       text,
  updated_at                  timestamptz not null default now()
);

comment on table public.vendor_coi_requirements is
  'Per-vendor COI minimums. Editable by ops; read by the app to evaluate coverage '
  'compatibility before issuance. PLACEHOLDER values — verify with each vendor.';

-- Allow all authenticated users to read vendor requirements (public-ish data)
alter table public.vendor_coi_requirements enable row level security;

create policy "authenticated read vendor requirements"
  on public.vendor_coi_requirements
  for select to authenticated
  using (true);

create policy "anon read vendor requirements"
  on public.vendor_coi_requirements
  for select to anon
  using (true);

-- Writes are service-role only (no insert/update/delete grant to authenticated/anon)

-- ---------------------------------------------------------------------------
-- Seed vendor requirements
-- PLACEHOLDER: verify actual requirements with each vendor before go-live.
-- ---------------------------------------------------------------------------
insert into public.vendor_coi_requirements
  (vendor_id, vendor_name, gl_limit, aggregate_limit, workers_comp_required, additional_insured_required, notes)
values
  ('gilandroy',     'Gil & Roy Props',               1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('hpr',           'Hand Prop Room',                1000000, 2000000, true,  true, 'PLACEHOLDER: full-service house; weapons inventory may require higher limits'),
  ('platinum',      'Platinum Props',                1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('omega',         'Omega Cinema Props',            1000000, 2000000, false, true, 'PLACEHOLDER: large studio; may require higher limits for full pulls'),
  ('artdimensions', 'Art Dimensions',                1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('ec',            'Eclectic Encore Prop',          1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('heritage',      'Heritage Props',                1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('historyforhire','History for Hire',              1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('propheaven',    'Prop Heaven',                   1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('target',        'Target Specialty Rentals',      1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('rcvintage',     'RC Vintage',                    1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('universal',     'Universal Studios Property',    2000000, 4000000, true,  true, 'PLACEHOLDER: studio-owned; typically requires higher limits'),
  ('propserviceswest','Prop Services West',          1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('pina',          'Pina Props',                    1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('warnerbros',    'Warner Bros. Studio Props',     2000000, 4000000, true,  true, 'PLACEHOLDER: studio-owned; typically requires higher limits'),
  ('objects',       'Objects',                       1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('alleycats',     'Alley Cat Props',               1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('alpha',         'Alpha Companies',               1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('depict33',      'Depict 33',                     1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('iss',           'ISS Props',                     1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor'),
  ('premiere',      'Premiere Props',                1000000, 2000000, false, true, 'PLACEHOLDER: verify with vendor')
on conflict (vendor_id) do nothing;

-- ---------------------------------------------------------------------------
-- certificates — issued COI records
-- ---------------------------------------------------------------------------
create table if not exists public.certificates (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  order_id            uuid,   -- nullable: COI can be requested outside checkout flow
  vendor_id           text not null,
  vendor_name         text not null,
  -- Provider data
  external_id         text,   -- the partner's certificate reference
  status              text not null default 'pending'
                        check (status in ('pending', 'issued', 'failed', 'expired')),
  -- Coverage snapshot at time of issuance
  coverage_snapshot   jsonb not null default '{}',
  -- Document
  document_url        text,
  -- Dates
  effective_date      date,
  expiry_date         date,
  -- Error capture
  error_message       text,
  -- Timestamps
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index certificates_org_idx  on public.certificates (org_id);
create index certificates_order_idx on public.certificates (order_id) where order_id is not null;

alter table public.certificates enable row level security;

create policy "members read org certificates"
  on public.certificates
  for select to authenticated
  using (org_id in (select private.current_user_org_ids()));

-- Server-only writes (no insert/update/delete grant to authenticated/anon)
revoke insert, update, delete on public.certificates from authenticated, anon;

comment on table public.certificates is
  'Issued COI records. The COI PARTNER issues coverage; Prop Haus stores the result. '
  'Prop Haus is NOT the insurer or broker.';
comment on column public.certificates.external_id is
  'Certificate reference from the partner COI provider. Null until issuance succeeds.';
comment on column public.certificates.coverage_snapshot is
  'Coverage data at issuance: { glLimit, aggregateLimit, namedInsured, additionalInsuredName? }.';
