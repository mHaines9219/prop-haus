-- ============================================================================
-- Switch catalog embeddings from vector(1536) to halfvec(1536).
--
-- 16-bit half-precision halves vector + HNSW-index storage with negligible
-- recall loss — the catalog (~91k × 1536-dim) plus its index no longer fits
-- comfortably on the current instance disk at full float32. The embed pipeline
-- still produces float32; pgvector rounds to fp16 on insert via a ::halfvec cast.
--
-- Tables are empty when this runs, so the ALTERs are instant. The HNSW index is
-- dropped here and (re)built by the loader AFTER the bulk insert, so index pages
-- aren't churned per-row during load.
-- ============================================================================

drop index if exists catalog.prop_items_embedding_idx;

alter table catalog.prop_items
  alter column embedding type extensions.halfvec(1536);
alter table catalog.prop_items_staging
  alter column embedding type extensions.halfvec(1536);

-- Rebuilt by scripts/load-catalog.ts after the data is loaded:
--   create index prop_items_embedding_idx on catalog.prop_items
--     using hnsw (embedding extensions.halfvec_cosine_ops);
