-- ============================================================================
-- MVP-9: retire COI issuance.
--
-- The insurance API partnership is off. Prop Haus does not issue, bind, or
-- broker certificates of insurance; the production's own broker does. What
-- survives is the data the one-click order pipeline still reads:
--   * organizations.insurance_profile — kept as-is; MVP-10 folds it into
--     order_profile.
--   * vendor_coi_requirements → vendor_insurance_minimums — same columns, new
--     meaning: what the vendor's COI must show, surfaced as a warning on the
--     outreach preview (MVP-11). Nothing is issued against it.
-- The issued-certificate ledger has no reason to exist and is dropped.
-- ============================================================================

drop table if exists public.certificates;

alter table if exists public.vendor_coi_requirements
  rename to vendor_insurance_minimums;

comment on table public.vendor_insurance_minimums is
  'Per-vendor insurance minimums: what this vendor''s COI must show. Read to warn '
  'the user before an order goes out; Prop Haus never issues coverage against it. '
  'PLACEHOLDER values — verify with each vendor.';
