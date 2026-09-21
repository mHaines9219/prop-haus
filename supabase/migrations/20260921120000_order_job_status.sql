-- ============================================================================
-- JOBS — user-assigned job status on orders
--
-- The /jobs dashboard shows one row per order ("a job IS an order", MVP-8).
-- `orders.status` is the vendor-driven lifecycle (placed → processing →
-- confirmed / cancelled) and is written by the coordination seam, never by the
-- user. This column is the OTHER axis: where the job sits on the user's own
-- board. Three values, set by hand from the dashboard and the job detail:
--
--   active   working it now (default for every new order)
--   pending  parked, waiting on something outside the platform
--   done     wrapped; stays visible under the Done filter
--
-- When a real `jobs` grouping entity lands (FUT-4) this column moves with it;
-- nothing here derives from line items, so it never conflicts with the
-- vendor rollups.
--
-- No RLS changes: orders keeps its org-scoped SELECT policy and service-role
-- writes from 20260830130000_orders_checkout.sql.
-- ============================================================================

alter table public.orders
  add column job_status text not null default 'active'
    check (job_status in ('active','pending','done'));

create index orders_job_status_idx on public.orders (org_id, job_status);

comment on column public.orders.job_status is
  'User-assigned board status for the /jobs dashboard: active | pending | done.
   Independent of `status`, which tracks vendor confirmation.';
