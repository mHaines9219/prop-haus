-- ============================================================================
-- Prop Haus — MVP-7 web clipper: document project_items.metadata's clip role
--
-- The brief called for a new `project_items.meta jsonb null` column, but the
-- table already ships an unused `metadata jsonb not null default '{}'` column
-- (20260829130000_strip_workflow_to_folders.sql). Reusing it beats adding a
-- near-duplicate: no column churn, and catalog items already default to '{}'.
--
-- This migration is documentation only — no schema change. Clipped items
-- (source = 'clip') store { retailer, price: { amount, currency }, description }
-- here; catalog-saved items leave it '{}'. Mapped to ProjectItem.meta in
-- lib/projects-db.ts, which surfaces '{}' as absent.
-- ============================================================================

comment on column public.project_items.metadata is
  'Web-clip extras for source = ''clip'' items (MVP-7): { retailer, price: { amount, currency }, description }. Catalog-saved items leave it ''{}''. See lib/projects-db.ts (mapped to ProjectItem.meta).';
