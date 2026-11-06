-- ============================================================================
-- Booking flow, sandbox only (Nov 2026).
--
-- One checkout, many houses: the card is saved with no charge, every house
-- gets its own inquiry packet, and each house then moves through its own
-- booking: confirmed, certificate issued, hold placed, captured at pickup.
--
-- orders.sandbox           the order was placed with the admin sandbox switch
--                          on. Nothing it writes is ever handed to a mailer,
--                          and its bookings are advanced by hand.
-- orders.payment_method    the card saved at checkout (id, brand, last4). No
--                          card numbers; the payment provider holds those.
-- order_bookings           one row per house on an order. `stage` is the
--                          state machine in lib/booking/machine.ts; `state`
--                          is everything the stages have produced so far
--                          (packet, amount, certificate, hold, capture,
--                          extras, history).
-- outbound_messages.status gains 'sandbox': written, never sent.
-- ============================================================================

alter table public.orders
  add column if not exists sandbox boolean not null default false,
  add column if not exists payment_method jsonb;

comment on column public.orders.sandbox is
  'Placed with the sandbox switch on: no inquiry is sent and bookings advance by hand.';
comment on column public.orders.payment_method is
  'The card saved at checkout: { id, brand, last4, setupIntentId, savedAt }. Never a card number.';

create table public.order_bookings (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references public.organizations(id) on delete cascade,
  order_id    uuid        not null references public.orders(id) on delete cascade,
  vendor_id   text        not null,
  vendor_name text        not null,
  stage       text        not null default 'inquiry_sent'
                check (stage in ('inquiry_sent','confirmed','coi_issued','hold_placed','captured','declined')),
  state       jsonb       not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (order_id, vendor_id)
);

create index order_bookings_org_idx on public.order_bookings (org_id);

alter table public.order_bookings enable row level security;

create policy "members read org order bookings" on public.order_bookings
  for select to authenticated
  using (org_id in (select private.current_user_org_ids()));

revoke insert, update, delete on public.order_bookings from authenticated, anon;

comment on table public.order_bookings is
  'One house''s booking on an order: inquiry, confirmation, certificate, hold, capture. '
  'Written only by the service role.';

alter table public.outbound_messages drop constraint if exists outbound_messages_status_check;
alter table public.outbound_messages
  add constraint outbound_messages_status_check
  check (status in ('sending','sent','failed','sandbox'));
