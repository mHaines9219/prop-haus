-- ============================================================================
-- MVP-8 JOBS — per-line-item status on order_items
--
-- CLAUDE.md promises the platform "tracks item statuses"; nothing implemented
-- it until now. Each cart line inside a placed order can move through vendor
-- coordination independently: an order to three houses is rarely confirmed all
-- at once. The four values match DESIGN.md §9.10's canonical StatusToken states
-- (PENDING / QUOTED / CONFIRMED / UNAVAILABLE); `quoted_cents` carries the price
-- a vendor came back with, rendered in data-strong on the job detail.
--
-- Order-level rollup ("Newel confirmed 4 of 6 items") is DERIVED in code
-- (lib/orders.ts summarizeOrder), never stored — the item rows are the truth.
--
-- No RLS changes: order_items already inherits the org-scoped SELECT policy from
-- 20260830130000_orders_checkout.sql; writes stay service-role (createAdminClient)
-- like every other order write.
-- ============================================================================

alter table public.order_items
  add column status text not null default 'pending'
    check (status in ('pending','quoted','confirmed','unavailable')),
  add column status_note text,
  add column quoted_cents integer;

comment on column public.order_items.status is
  'Per-line vendor coordination state: pending | quoted | confirmed | unavailable.
   Order-level status is derived from these in code, not stored.';
comment on column public.order_items.quoted_cents is
  'Price a vendor quoted for this line (nullable; set when status = quoted).';
