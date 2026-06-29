-- ============================================================================
-- catalog_writer owns the catalog tables.
--
-- The direct-load pipeline (scripts/load-catalog.ts) DROPs and re-CREATEs the
-- HNSW index around the bulk insert. CREATE INDEX requires table OWNERSHIP —
-- a table-level GRANT ALL does not cover it — so the writer must own the tables.
-- CREATE on the schema lets the role own objects there. This stays within the
-- isolation boundary: catalog_writer still has zero privileges on public/auth.
-- ============================================================================

grant create on schema catalog to catalog_writer;

-- Reassigning ownership requires the executing role to be a member of the new
-- owner. Supabase runs migrations as `postgres`.
grant catalog_writer to postgres;

alter table catalog.prop_items         owner to catalog_writer;
alter table catalog.prop_items_staging owner to catalog_writer;
