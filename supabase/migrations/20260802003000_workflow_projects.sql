-- ============================================================================
-- Prop Haus — project / vendor-request / line-item workflow schema
--
-- Moves MVP pillars 3–6 off `data/projects.json` (lib/projects.ts, node:fs)
-- and into Postgres. That file is ephemeral and unshared on serverless, so
-- every project, quote, COI state and approval is lost between invocations
-- today.
--
-- Shape mirrors the existing TS types in lib/projects.ts so the port is a
-- swap of two private functions, not a redesign:
--
--   Project       -> public.projects
--   VendorRequest -> public.vendor_requests   (VendorCoi inlined; it is 1:1)
--   LineItem      -> public.line_items
--
-- Access model (deliberate, and it matches usage_counters/events):
--   ALL WRITES ARE SERVER-ONLY. The vendor write path cannot be expressed as an
--   RLS policy at all: a vendor response comes from an UNAUTHENTICATED vendor
--   whose only credential is the 16-byte URL token, which RLS cannot see. The
--   token is validated in app code against vendor_requests.token and the write
--   goes through the service-role client. Project creation is service-side too,
--   after the route handler has checked the caller's org membership.
--   Authenticated org members get read-only policies — what the UI needs and
--   nothing more.
--
--   org_id is NOT NULL. Auth is in MVP scope, every project is owned by exactly
--   one organization, and there are zero rows today so requiring it now is
--   free. A nullable owner column is the kind of thing that never does get
--   backfilled.
--
-- Derived state (vendor_requests.status from its lines, projects.status from
-- its vendors) stays in app code where it already lives — see
-- lib/projects.ts:updateLineStatus. No triggers; one source of truth.
--
-- NOTE: run `supabase db advisors` after applying.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- projects
--
-- `id` is text, not uuid: the app mints its own id (crypto.randomBytes hex)
-- and returns the project synchronously from createProject. 16 bytes of hex is
-- 128 bits, slightly more entropy than uuid v4's 122 — worth keeping, because
-- the project URL is shared with people outside the owning org.
-- ---------------------------------------------------------------------------
create table public.projects (
  id                text primary key,
  org_id            uuid not null references public.organizations(id) on delete cascade,
  status            text not null default 'submitted'
                      check (status in ('submitted','quoting','proposed','confirmed','cancelled')),
  production_name   text not null,
  production_type   text not null,
  start_date        date not null,
  end_date          date not null,
  delivery_address  text not null,
  contact_name      text not null,
  contact_email     text not null,
  contact_phone     text not null,
  budget            text,
  notes             text,
  -- Snapshot of the requesting org's insurance at submission time (TS: Project.insured,
  -- a BusinessProfile). Snapshotted rather than joined: a proposal must still render
  -- the policy it was quoted against after the org edits their coverage.
  insured           jsonb,
  approved_at       timestamptz,
  -- Soft-hide from the my-jobs list without spending a status enum value on it.
  -- Archiving is orthogonal to status: a confirmed job and a cancelled one can
  -- both be archived, and neither should stop being what it was.
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  metadata          jsonb not null default '{}',
  constraint projects_dates_ordered check (end_date >= start_date)
);

-- The my-jobs list query: one org's jobs, newest first — the exact shape
-- listProjects() sorts by. This serves both the default (archived_at is null)
-- and show-archived views; the planner applies archived_at as a filter on top.
-- A second partial index on archived_at is null was measured and dropped: it
-- only adds write cost until the table is large enough for the planner to
-- prefer it.
create index projects_org_created_idx on public.projects (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- vendor_requests
--
-- One per (project, vendor). VendorCoi is inlined rather than given its own
-- table because it is strictly 1:1 with the request and always read with it.
--
-- `vendor` is unconstrained text, matching public.org_vendor_accounts.vendor —
-- onboarding a new scraper must not require a migration.
-- ---------------------------------------------------------------------------
create table public.vendor_requests (
  id                 uuid primary key default gen_random_uuid(),
  project_id         text not null references public.projects(id) on delete cascade,
  vendor             text not null,
  status             text not null default 'pending'
                       check (status in ('pending','partial','responded')),
  -- Bearer capability handed to the vendor as /vendor/<token>. Server-validated;
  -- never exposed to `authenticated` (see the column grant at the bottom).
  token              text not null unique,
  responded_at       timestamptz,

  -- --- COI (TS: VendorCoi) ---
  coi_status         text not null default 'not-required'
                       check (coi_status in ('not-required','gap','needed','requested','received','approved')),
  -- CompatibilityResult from lib/insurance.ts: { status, issues[] }. Stored as the
  -- computed snapshot because the vendor requirement table it was evaluated against
  -- (VENDOR_COI) is app-side data that changes independently of the project.
  coi_compatibility  jsonb not null default '{}',
  coi_requested_at   timestamptz,
  coi_received_at    timestamptz,
  coi_approved_at    timestamptz,
  coi_cert_url       text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  metadata           jsonb not null default '{}',
  unique (project_id, vendor)
);

-- setCoiStatus(projectId, vendor) is covered by the unique constraint above.
-- getProjectByToken(token) is covered by the unique on token.
create index vendor_requests_project_idx on public.vendor_requests (project_id);

-- ---------------------------------------------------------------------------
-- line_items
--
-- `item_id` is the catalog PropItem id as carried through the cart; it is not a
-- FK to catalog.prop_items because a project must survive an item being
-- de-listed on a re-scrape. name/image are snapshotted for the same reason —
-- a proposal has to render what was actually requested.
--
-- QUOTE MODEL — read this before changing it.
--   The previous shape was a bare `priceQuote: number`, multiplied only by qty.
--   That makes a 1-day and a 30-day rental produce an identical total on a
--   document productions budget against.
--
--   The fix is NOT to multiply by (end_date - start_date). Prop houses do not
--   price that way: a "week" is commonly five working days, prep and strike are
--   often free or half rate, and vendors quote things like a "3-day week".
--   Deriving the period count ourselves would make us confidently wrong.
--
--   So we store what the vendor actually said. quote_periods is prefilled from
--   the booking window as a suggestion and is editable on the vendor response
--   form; whatever comes back is what the proposal renders.
--
--   line total = quote_amount * qty * quote_periods
--
--   quote_unit reuses the enum from Price.unit (lib/types.ts) verbatim so the
--   catalog's published rate and a vendor's quote speak one vocabulary.
--   'event' and 'purchase' are flat fees and pin quote_periods to 1.
-- ---------------------------------------------------------------------------
create table public.line_items (
  id                 uuid primary key default gen_random_uuid(),
  vendor_request_id  uuid not null references public.vendor_requests(id) on delete cascade,
  item_id            text not null,
  source_id          text not null,
  name               text not null,
  image              text,
  qty                integer not null check (qty > 0),
  status             text not null default 'pending'
                       check (status in ('pending','available','sub','unavailable')),

  quote_amount       numeric(12,2) check (quote_amount >= 0),
  quote_unit         text check (quote_unit in ('day','week','month','event','purchase')),
  quote_periods      numeric(6,2) check (quote_periods > 0),
  quote_currency     text not null default 'USD',

  sub_note           text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  metadata           jsonb not null default '{}',

  -- updateLineStatus(token, itemId) resolves to exactly one row.
  unique (vendor_request_id, item_id),

  -- A quote is all-or-nothing: an amount is meaningless without its unit and
  -- period count, and this is the constraint that stops a bare number sneaking
  -- back in and silently under-billing a long rental.
  constraint line_items_quote_complete check (
    (quote_amount is null and quote_unit is null and quote_periods is null)
    or
    (quote_amount is not null and quote_unit is not null and quote_periods is not null)
  ),

  -- Flat-fee units are not multiplied over the booking window.
  constraint line_items_flat_fee_single_period check (
    quote_unit not in ('event','purchase') or quote_periods = 1
  )
);

create index line_items_vendor_request_idx on public.line_items (vendor_request_id);

-- ---------------------------------------------------------------------------
-- RLS — read-only for org members, all writes via service role.
-- ---------------------------------------------------------------------------

alter table public.projects        enable row level security;
alter table public.vendor_requests enable row level security;
alter table public.line_items      enable row level security;

create policy "members read org projects" on public.projects
  for select to authenticated
  using (org_id in (select private.current_user_org_ids()));

create policy "members read org vendor requests" on public.vendor_requests
  for select to authenticated
  using (project_id in (
    select id from public.projects
    where org_id in (select private.current_user_org_ids())
  ));

create policy "members read org line items" on public.line_items
  for select to authenticated
  using (vendor_request_id in (
    select vr.id from public.vendor_requests vr
    join public.projects p on p.id = vr.project_id
    where p.org_id in (select private.current_user_org_ids())
  ));

revoke insert, update, delete on public.projects        from authenticated, anon;
revoke insert, update, delete on public.vendor_requests from authenticated, anon;
revoke insert, update, delete on public.line_items      from authenticated, anon;

-- The vendor token is a bearer credential for a route that bypasses auth
-- entirely. A member reading their own project has no use for it, and leaking
-- it through the Data API would let anyone who can read a project act as any
-- of its vendors. Server-side reads use the service role, which ignores grants.
revoke select on public.vendor_requests from authenticated, anon;
grant select (id, project_id, vendor, status, responded_at,
              coi_status, coi_compatibility, coi_requested_at, coi_received_at,
              coi_approved_at, coi_cert_url, created_at, updated_at, metadata)
  on public.vendor_requests to authenticated;
