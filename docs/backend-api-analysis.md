# MVP-6 · Backend analysis — our side of the compare/contrast

Status: the competitor captures have NOT landed yet. This document is the
prepared half of the comparison: a precise inventory of our own API surface,
plus pre-identified weaknesses the captures should confirm or refute. When
captures land (drop them in `docs/competitor-captures/`, see the README
there), the compare/contrast slots into section 4 and the "emulate" bucket
gets reviewed with Matthew before anything is implemented.

Do NOT implement the candidate improvements below ahead of the comparison —
the whole point of MVP-6 is to let competitor evidence reorder this list.
Exception: anything MVP-1 (search data completion) claims is theirs;
coordinate, these tasks share endpoints.

---

## 1. Endpoint inventory

Verified against code on `mHaines9219/sofia`, Aug 30 2026.

### POST `/api/search` — AI search (text + vision)
- **Auth/metering:** session required (401); allowance checked before the
  model call (402 with usage snapshot when exhausted). Charged only when
  matches > 0; zero-result searches are free to the org but cost provider
  spend. Events recorded: `search`, `vision_search`, `zero_result_search`,
  `paywall_hit`.
- **Request:** JSON `{query?, mode?}` or multipart (`query`, `mode`, up to 6
  files ≤ 8MB — PNG/JPEG/WEBP/GIF/PDF). Query ≤ 400 chars. Attachments
  auto-promote mode; metric is `visionSearches` iff attachments present,
  else `aiSearchesPerDay`.
- **Modes** (`lib/search-modes.ts`): `text` (embed + LLM rerank via
  OpenRouter, default `openai/gpt-4o-mini`), `haiku` / `sonnet` (moodboard
  interpretation via Claude Haiku 4.5, per-bucket rerank),
  `haiku-then-sonnet` (Haiku extracts, Sonnet 4.6 ranks a unified pool).
- **Response:** `{query, mode, modelsUsed, interpretation?, matches[≤60]
  {item: full PropItem, matchedVia[], score}, explanation?, usage, error?}`.
- **Data path:** query embedding via OpenRouter `text-embedding-3-small`
  (1536-dim); shortlist = in-memory cosine topK over `data/embeddings.f32`
  + `data/embeddings.ids.json`; items hydrated from `data/catalog.json`
  (module-cached). All three files are gitignored local artifacts.
- **No pagination, no caching, force-dynamic.** Errors: 400 input, 401,
  402, 502 provider, 500 missing `OPENROUTER_API_KEY`.

### GET `/api/keyword?q=` — keyword search
- **Public.** `q` ≤ 200 chars; empty → `{matches: [], total: 0}`.
- **Scoring** (`lib/keyword-search.ts`): AND semantics across tokens;
  field-weighted (name 6 … description 1); exact ×2.5 / word-boundary ×1.5 /
  substring ×1.0; +8 phrase bonus; tie-break name asc.
- **Response:** `{query, matches[≤60] {item: CardItem projection,
  matchedVia[≤4], score}, total}` — total counts all matches but there is
  no way to fetch past 60.
- **Data path:** full O(n × tokens) scan of module-cached
  `data/catalog.json` in Node, per request. No index, no cache headers.

### GET `/api/browse?category=&vendor=&offset=&limit=` — paginated browse
- **Public.** Offset/limit (default 24, clamp 1–60). Filters: exact
  category slug, exact vendor id, `has_images = true` always.
- **Response:** `{items: CardItem[], total}`. Totals from the facets
  materialized view (single-dimension filter) or a live count
  (category+vendor combined). Offset past end → empty items, real total.
- **Data path:** Supabase `catalog_items` via anon client, card projection
  (`id, source, source_id, name, subcategory, images[0:1]`), composite
  index on `(has_images, category, source)`.
- **Cached:** `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.

### Projects/org endpoints (context, not comparison targets)
- `GET|POST /api/projects`, `POST|DELETE /api/projects/[id]/items`,
  `POST /api/projects/[id]/archive` — session + org-scoped, service-role
  writes, RLS-locked tables, 404-on-foreign-org (no existence probing).
- `GET /api/usage` — allowance snapshot per metric
  (`visionSearches` lifetime, `aiSearchesPerDay` UTC-daily), plan limits in
  `lib/plans.ts`, atomic counter increments via RPC.

### Shared shapes
- **PropItem** (full): identity, category tree, enrichment arrays
  (style/era/materials/colors/vibes/settingType/genreFit/tags), dimensions,
  price `{amount, currency, unit}`, vendor block, images, sourceUrl,
  scrapedAt.
- **CardItem** (list projection): `id, source, sourceId, name, subcategory,
  images[0:1]` — note it currently carries NO price/dimensions (MVP-5b
  punch-list item 2 extends this) and no `plate_mode` (item 1).

---

## 2. Pre-identified weaknesses (our side)

Things the captures will likely throw into relief. Each is a candidate, not
a commitment.

1. **Split data plane.** Browse reads Supabase; keyword and AI search read
   gitignored local files (`catalog.json`, `embeddings.f32`, ~550MB in
   process memory). A fresh deploy has working browse and *empty search*.
   Cold starts pay the embedding-index load. Postgres already stores an
   `embedding` column (see `20260627190000_catalog_inventory.sql`) — a
   pgvector path exists in the schema but nothing serves from it.
2. **Built-but-unwired DB keyword path.** Migrations
   `20260802170000_keyword_tsv_column`, `20260802190000_keyword_side_table`,
   `20260802190500_rebuild_keyword_gin` (and
   `20260802150000_revoke_unmerged_keyword_rpc`) built a tsvector/GIN
   keyword path that `/api/keyword` never calls — it still full-scans JSON
   in Node per request. Either wire it or delete it; today we run the cost
   of both. **Coordinate with MVP-1 before touching.**
3. **Capped, unpageable search results.** Both search endpoints hard-cap at
   60 with a `total` the client can see but never fetch. Competitors almost
   certainly paginate search.
4. **No response caching on `/api/keyword`.** It is deterministic, public,
   and GET — the same s-maxage treatment as browse would make repeat and
   shared queries free.
5. **Thin faceting.** Browse supports exactly one category + one vendor,
   single-select, no multi-select, no style/era/color/price facets despite
   the enrichment arrays existing on every item. Facet counts only exist
   for the unfiltered view (the MV); filtered facet counts are absent.
6. **Full-fat search payloads.** `/api/search` returns complete PropItems
   (enrichment arrays, description, all images) for 60 matches;
   browse/keyword return 10×-smaller CardItems. Inconsistent, and heavy.
7. **Inconsistent envelopes.** `{items, total}` vs `{matches, total}` vs
   `{matches, query}`; errors are ad-hoc `{error}` strings with varying
   fields. Fine today, worth aligning if we adopt anything structural.

---

## 3. What to look for in the captures

Questions the competitor material should answer, mapped to the weaknesses:

- How do they paginate search (cursor? offset? infinite)? Result caps?
- Search-as-you-type: do they have a suggest/typeahead endpoint? Debounce
  behavior, response latency, payload size per keystroke?
- Facets: which dimensions, multi-select?, do filtered facet counts come
  back with every response or a separate call?
- Item payload in list responses: which fields do they project? Do they
  ship price/dimensions/availability in the grid?
- Caching: CDN headers, ETags, response times cold vs warm.
- Error/empty handling: what does a zero-result search return?
- Anything availability/hold-related in their responses (fields we'd need
  for the vendor coordination layer).

## 4. Compare/contrast (pending captures)

To be filled in when material lands in `docs/competitor-captures/`:

- **WRONG (avoid):** —
- **DOESN'T FIT (skip):** —
- **EMULATE (scoped changes, review with Matthew before implementing):** —
