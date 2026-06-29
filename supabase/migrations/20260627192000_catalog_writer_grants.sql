-- ============================================================================
-- catalog_writer: grants needed by the db:load pipeline (scripts/load-catalog.ts).
--
-- 1. USAGE on `extensions` — the loader casts embeddings to extensions.vector;
--    without schema USAGE the cast errors with "permission denied".
-- 2. BYPASSRLS — the writer bulk-loads prop_items_staging (RLS-on, no policy)
--    and the swap inserts into prop_items (SELECT-only policy). The dedicated
--    pipeline role should not be filtered by RLS on its own schema. This stays
--    safe: catalog_writer has zero table privileges outside `catalog`, so
--    bypassing RLS grants no reach into public/auth.
-- ============================================================================

grant usage on schema extensions to catalog_writer;
alter role catalog_writer with bypassrls;
