-- ============================================================================
-- MVP-3 CHECKOUT — orders, order_items, org checkout profile
--
-- Access model mirrors projects/project_items:
--   * Reads:  RLS lets org members see their own orders.
--   * Writes: revoked from authenticated/anon — route handlers use the
--             service role (createAdminClient) so the org_id is always
--             resolved from the session, never the body.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Org checkout profile
--
-- Stored on organizations so one-click checkout has nothing to ask.
-- Shape: { productionName, contactName, contactEmail, contactPhone,
--           defaultRentalWindowDays }
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists checkout_profile jsonb not null default '{}';

comment on column public.organizations.checkout_profile is
  'Defaults for one-click checkout. Shape: { productionName, contactName,
   contactEmail, contactPhone, defaultRentalWindowDays }.';

-- Allow authenticated members to update their own org checkout profile.
-- plan remains write-protected (only service role may change billing tier).
grant update (checkout_profile) on public.organizations to authenticated;

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id               uuid        primary key default gen_random_uuid(),
  org_id           uuid        not null references public.organizations(id) on delete cascade,
  status           text        not null default 'placed'
                                 check (status in ('placed','processing','confirmed','cancelled')),
  rental_start     date,
  rental_end       date,
  delivery_notes   text,
  total_cents      bigint,     -- nullable; many houses are quote-only
  idempotency_key  text        unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index orders_org_idx    on public.orders (org_id);
create index orders_status_idx on public.orders (status);

alter table public.orders enable row level security;

create policy "members read org orders" on public.orders
  for select to authenticated
  using (org_id in (select private.current_user_org_ids()));

revoke insert, update, delete on public.orders from authenticated, anon;

comment on table public.orders is
  'A placed order: snapshot of a cart at checkout, owned by an org.
   Written only by the service role.';

-- ---------------------------------------------------------------------------
-- order_items
--
-- Snapshotted at checkout so the record survives de-listing on a re-scrape.
-- ---------------------------------------------------------------------------
create table public.order_items (
  id          uuid        primary key default gen_random_uuid(),
  order_id    uuid        not null references public.orders(id) on delete cascade,
  item_id     text        not null,
  source      text        not null,
  source_id   text        not null,
  name        text        not null,
  image       text,
  source_url  text        not null,
  vendor      text        not null,
  price_cents bigint,     -- nullable; quote-only vendors don't send a price
  created_at  timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);

alter table public.order_items enable row level security;

create policy "members read org order items" on public.order_items
  for select to authenticated
  using (order_id in (
    select id from public.orders
    where org_id in (select private.current_user_org_ids())
  ));

revoke insert, update, delete on public.order_items from authenticated, anon;

comment on table public.order_items is
  'A snapshotted cart line inside a placed order.';
