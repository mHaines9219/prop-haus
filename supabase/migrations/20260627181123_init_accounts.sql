-- ============================================================================
-- Prop Haus — accounts, billing, events, documents (initial schema)
--
-- Postgres + Supabase Auth + Row-Level Security. Every public table has RLS
-- enabled and is scoped to the organizations the current user belongs to,
-- resolved through the memberships join table via a SECURITY DEFINER helper
-- in a PRIVATE schema (avoids RLS recursion on memberships, and isn't callable
-- from the Data API).
--
-- Security invariants enforced here:
--   * organizations.plan is NOT client-writable (column grant) — only the
--     billing webhook (service role) may change it. No self-upgrade.
--   * usage_counters and events are SERVER-WRITTEN ONLY — no paywall bypass,
--     no forged analytics.
--   * documents live in a PRIVATE storage bucket; access via signed URLs.
--
-- NOTE: generate the real migration file via `supabase migration new` and run
-- `supabase db advisors` before applying. Verify against the current Supabase
-- changelog — auth/RLS conventions change between versions.
-- ============================================================================

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.organizations (
  id                    uuid primary key default gen_random_uuid(),
  type                  text not null default 'personal' check (type in ('personal','company')),
  name                  text not null,
  plan                  text not null default 'free' check (plan in ('free','pro')),
  address               text,
  contact               jsonb,
  insurance             jsonb,
  production_types      text[],
  markets               text[],
  annual_project_volume text check (annual_project_volume in ('1-5','6-20','21-50','50+')),
  typical_budget_band   text check (typical_budget_band in ('under_5k','5k_25k','25k_100k','100k_plus')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  metadata              jsonb not null default '{}'
);

create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  org_id                uuid not null references public.organizations(id),
  email                 text not null,
  full_name             text,
  profession            text check (profession in (
                          'set_decorator','production_designer','art_director','prop_master',
                          'producer','stylist','event_producer','experiential_producer','other')),
  heard_about_us        text,
  heard_about_us_detail text,
  onboarded_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  metadata              jsonb not null default '{}'
);

create table public.memberships (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table public.org_vendor_accounts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  vendor      text not null,
  status      text not null default 'claimed' check (status in ('claimed','verified','rejected')),
  account_ref text,
  coi_on_file boolean not null default false,
  verified_at timestamptz,
  verified_by text check (verified_by in ('org_claimed','platform_confirmed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  metadata    jsonb not null default '{}',
  unique (org_id, vendor)
);

create table public.usage_counters (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  period     text not null,  -- 'lifetime' or 'YYYY-MM'
  metric     text not null,  -- 'visionSearches' | 'aiSearchesPerMonth'
  count      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (org_id, period, metric)
);

create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  kind         text not null check (kind in ('w9','coi','other')),
  vendor       text,
  storage_path text not null, -- path within the private 'documents' bucket; first segment = org_id
  filename     text not null,
  mime         text,
  size_bytes   integer,
  uploaded_by  uuid references auth.users(id),
  status       text not null default 'uploaded' check (status in ('uploaded','verified','rejected','expired')),
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  metadata     jsonb not null default '{}'
);

create table public.events (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references public.organizations(id) on delete set null,
  user_id    uuid references auth.users(id) on delete set null,
  type       text not null,
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index events_org_created_idx on public.events (org_id, created_at desc);
create index events_type_created_idx on public.events (type, created_at desc);

-- ---------------------------------------------------------------------------
-- Membership helpers (PRIVATE schema, SECURITY DEFINER to avoid RLS recursion).
-- Not granted to PUBLIC; only authenticated may execute (needed for policy eval).
-- ---------------------------------------------------------------------------

create or replace function private.current_user_org_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select org_id from public.memberships where user_id = (select auth.uid());
$$;
revoke all on function private.current_user_org_ids() from public;
grant execute on function private.current_user_org_ids() to authenticated;

create or replace function private.is_org_admin(target_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = (select auth.uid()) and org_id = target_org and role in ('owner','admin')
  );
$$;
revoke all on function private.is_org_admin(uuid) from public;
grant execute on function private.is_org_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- New-user trigger: every auth user gets a personal org + owner membership +
-- profile stub immediately, so there are no null-org states. Onboarding later
-- fills profession/heardAboutUs (and may convert the org to a company).
-- SECURITY DEFINER (must write public tables during signup); revoked from
-- callers so it's only reachable via the trigger.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  new_org_id uuid;
  display_name text;
begin
  display_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    new.email
  );

  insert into public.organizations (type, name)
  values ('personal', coalesce(display_name, 'My workspace'))
  returning id into new_org_id;

  insert into public.profiles (id, org_id, email, full_name)
  values (new.id, new_org_id, new.email, display_name);

  insert into public.memberships (org_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Enable RLS on everything in public.
-- ---------------------------------------------------------------------------

alter table public.organizations      enable row level security;
alter table public.profiles           enable row level security;
alter table public.memberships        enable row level security;
alter table public.org_vendor_accounts enable row level security;
alter table public.usage_counters     enable row level security;
alter table public.documents          enable row level security;
alter table public.events             enable row level security;

-- ---------------------------------------------------------------------------
-- organizations — members read; admins update everything EXCEPT plan.
-- plan is mutable only by the service role (billing webhook).
-- ---------------------------------------------------------------------------
create policy "org members read their orgs" on public.organizations
  for select to authenticated
  using (id in (select private.current_user_org_ids()));

create policy "org admins update their org" on public.organizations
  for update to authenticated
  using (private.is_org_admin(id))
  with check (private.is_org_admin(id));

revoke update on public.organizations from authenticated;
grant update (name, type, address, contact, insurance, production_types, markets,
              annual_project_volume, typical_budget_band, updated_at, metadata)
  on public.organizations to authenticated;
-- NB: `plan` deliberately omitted — service role only.

-- ---------------------------------------------------------------------------
-- profiles — read others in your orgs; update only your own (not id/org_id).
-- ---------------------------------------------------------------------------
create policy "read profiles in my orgs" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or org_id in (select private.current_user_org_ids()));

create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke update on public.profiles from authenticated;
grant update (full_name, profession, heard_about_us, heard_about_us_detail, onboarded_at, updated_at, metadata)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- memberships — members read their orgs' rows; admins manage.
-- ---------------------------------------------------------------------------
create policy "read memberships in my orgs" on public.memberships
  for select to authenticated
  using (org_id in (select private.current_user_org_ids()));

create policy "admins manage memberships" on public.memberships
  for all to authenticated
  using (private.is_org_admin(org_id))
  with check (private.is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- org_vendor_accounts — members read/write their orgs' relationships.
-- (Promoting status to 'verified' should be done server-side; see app notes.)
-- ---------------------------------------------------------------------------
create policy "members read vendor accounts" on public.org_vendor_accounts
  for select to authenticated
  using (org_id in (select private.current_user_org_ids()));

create policy "members write vendor accounts" on public.org_vendor_accounts
  for all to authenticated
  using (org_id in (select private.current_user_org_ids()))
  with check (org_id in (select private.current_user_org_ids()));

-- ---------------------------------------------------------------------------
-- usage_counters — members read (to show "2 of 3 left"); SERVER WRITES ONLY.
-- ---------------------------------------------------------------------------
create policy "members read usage" on public.usage_counters
  for select to authenticated
  using (org_id in (select private.current_user_org_ids()));

revoke insert, update, delete on public.usage_counters from authenticated, anon;

-- ---------------------------------------------------------------------------
-- documents — members read; members upload (as themselves); admins delete.
-- Status changes to 'verified' are server-side only (see app notes).
-- ---------------------------------------------------------------------------
create policy "members read org documents" on public.documents
  for select to authenticated
  using (org_id in (select private.current_user_org_ids()));

create policy "members upload org documents" on public.documents
  for insert to authenticated
  with check (org_id in (select private.current_user_org_ids())
              and uploaded_by = (select auth.uid()));

create policy "admins delete org documents" on public.documents
  for delete to authenticated
  using (private.is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- events — members read their org's events; SERVER WRITES ONLY (no forgery).
-- ---------------------------------------------------------------------------
create policy "members read org events" on public.events
  for select to authenticated
  using (org_id in (select private.current_user_org_ids()));

revoke insert, update, delete on public.events from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Storage: private 'documents' bucket for W9s/COIs.
-- RLS on storage.objects scopes access by the first path segment = org_id.
-- Downloads happen via short-lived signed URLs minted server-side.
-- (upsert needs SELECT + INSERT + UPDATE — all three granted to members.)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "members read org files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (select id::text from private.current_user_org_ids() id)
  );

create policy "members upload org files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (select id::text from private.current_user_org_ids() id)
  );

create policy "members update org files" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (select id::text from private.current_user_org_ids() id)
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (select id::text from private.current_user_org_ids() id)
  );
