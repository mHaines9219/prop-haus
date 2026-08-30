-- MVP-2: contractors + crew_requests tables
--
-- contractors: platform-curated labor directory (not self-signup). Category
-- field is intentionally generic ('crew' for now) so FUT-1 can extend this
-- table to catering, styling, equipment, etc. without a schema migration.
--
-- crew_requests: an org's request to hire a contractor for specific dates.
-- Status transitions happen server-side; authenticated users can only insert.

create table public.contractors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  photo      text,
  skills     text[] not null default '{}', -- 'delivery','set-hands','load-in','load-out','set-dressing','general'
  city       text not null default 'los_angeles',
  rate_low   integer,      -- day rate in cents (null = rate on request)
  rate_high  integer,
  bio        text,
  category   text not null default 'crew',  -- FUT-1: extend to 'catering','styling',etc.
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata   jsonb not null default '{}'
);

create table public.crew_requests (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  contractor_id   uuid not null references public.contractors(id),
  requested_dates text[] not null default '{}',  -- ISO date strings
  location        text,
  notes           text,
  status          text not null default 'requested'
                  check (status in ('requested', 'confirmed', 'declined')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index crew_requests_org_idx        on public.crew_requests (org_id);
create index crew_requests_contractor_idx on public.crew_requests (contractor_id);

alter table public.contractors   enable row level security;
alter table public.crew_requests enable row level security;

-- Browse is public: anyone can read active contractors
create policy "public read active contractors" on public.contractors
  for select
  using (active = true);

-- crew_requests: org-scoped read and insert; status updates are server-only
create policy "members read own crew requests" on public.crew_requests
  for select to authenticated
  using (org_id in (select private.current_user_org_ids()));

create policy "members create crew requests" on public.crew_requests
  for insert to authenticated
  with check (org_id in (select private.current_user_org_ids()));

revoke update, delete on public.crew_requests from authenticated;
