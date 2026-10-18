-- The cart's request form (Oct 2026): one form asks for what every rental
-- house needs — dates, location, shoot details — and the click sends it to
-- every vendor. Dates and location already have columns; shoot details is
-- new. Snapshotted on the order so the emails and forms read the order,
-- never the live cart.

alter table public.orders
  add column if not exists shoot_details text;

comment on column public.orders.shoot_details is
  'Free text from the cart request form: what is being shot and how the pieces are used. Goes into every vendor email for the order.';
