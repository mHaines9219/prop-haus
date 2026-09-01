# MVP-6 · Backend analysis — our side of the compare/contrast

Status: captures for GetSet and Propcart landed 2026-08-31 (see
`docs/competitor-captures/`), section 4 is written, and the emulate bucket
was reviewed with Matthew the same day. Section 4 is now the implementation
guide; sections 1–3 remain as the our-side inventory it compares against.

Coordinate with MVP-1 (search data completion) before touching shared
endpoints — these tasks overlap on `/api/search` and `/api/keyword`.

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

## 4. Compare/contrast

Based on live captures of GetSet (wegetset.com, authenticated search
response) and Propcart (propcart.com, client-side Typesense traffic),
2026-08-31. Raw material and per-competitor detail in
`docs/competitor-captures/getset/` and `docs/competitor-captures/propcart/`.

**Priorities from Matthew for whoever implements this:** we care most about
(a) collecting data on which vendors are most popular, (b) making the UI
load fast, and (c) making our AI tooling (enrich/embed/search, future
image-to-3D) efficient. The emulate list below is ordered with that in mind.

### EMULATE (scoped changes — reviewed with Matthew 2026-08-31)

1. **Outbound-click demand signal — WITHOUT link proxying.** GetSet proxies
   every outbound vendor link through `/api/products/vr?s=<sku>&v=<code>`
   to capture which items/vendors win real click-outs. We want the same
   signal (it directly answers "which vendors are most popular" — searches
   show intent, click-outs show wins) but not the mechanism: a proxy adds
   latency, breaks vendor referrer attribution, and is a SPOF. Instead:
   fire-and-forget beacon on outbound click into the existing events table
   (alongside `search`/`zero_result_search`), keyed by item + vendor +
   source surface. Direct attributed `href` stays. Feeds the demand-ranked
   browse order (PR #68) and, later, vendor-facing "N qualified clicks"
   reporting.
2. **`imageHash` — content hash per image at ingest.** GetSet stamps every
   image with a content hash. For us this is an AI-cost multiplier: skip
   re-embedding/re-enriching when a re-scrape returns an unchanged image;
   dedupe identical photos across listings; cache future image-to-3D GLBs
   (FUT-2) per hash instead of per item. Makes AI passes scale with
   *change*, not catalog size.
3. **AI-vs-source provenance separation (GetSet's `aiMetadata` pattern).**
   Raw scraped fields stay immutable; AI-derived normalizations live in a
   separate namespaced structure beside them (their `aiMetadata.dimensions`
   parses free-text into `{width, height, depth}`; `.description` cleans
   tag-soup titles into sentences). Lets any AI pass be re-run with a
   better model without destroying source data, and makes derived values
   auditable. First concrete applications for us: parsed dimensions (also
   needed by MVP-5b's camera-report placard) and a `unit` backfill — our
   `Price.unit` vocabulary (lib/types.ts) is already better-shaped than
   GetSet's `rentalPricePeriod`, but coverage is thin because scrapers only
   capture stated periods; an enrichment pass can infer `week` from vendor
   convention, stored with AI provenance, never overwriting scraper-
   confirmed values.
4. **Duplicate/canonical linkage (GetSet's `isOriginalOf`).** Cross-vendor
   dupes are real (vendors cross-list on 1stdibs; GetSet even indexes
   propcart.com listings). Dupes waste our capped 60 rerank slots and would
   double-spend FUT-2 model generation. A canonical-item link (seeded via
   imageHash + fuzzy title match) lets search collapse dupes and show
   "available from N vendors" — a better result for a set decorator and
   on-thesis for aggregation.
5. **Category provenance (GetSet's `searchCategories.source: ai|tags`).**
   Category assignments carry which pipeline produced them and coexist.
   Directly addresses the mapper-gap class of bug from the recategorization
   work (PRs #68/#70): AI recategorization becomes re-runnable/rollbackable
   without clobbering scraper-derived categories.
6. **Rich faceting from real enrichment data (Propcart).** Their whole
   filter sidebar is Typesense `facet_by` over tags/colors/eras/styles/
   rooms/materials/price-bins/vendor, with live counts per query and a
   price-histogram slider. We already store all of these dimensions in
   enrichment arrays and expose none of them (weakness #5). We do NOT need
   Typesense for this: Postgres can serve faceted counts over the catalog
   schema. Biggest capability gap vs both competitors.
7. **Typeahead with a thin projection (Propcart).** Per-keystroke suggest
   endpoint returning ~4 fields (`title, tags, sku, vendor`), 5 results,
   with match highlighting. Cheap, fast-feeling, and a UI-speed win —
   pairs with the response-caching fix (weakness #4).
8. **Field-level typo tolerance (Propcart).** `num_typos` per field — 2 on
   free text, 0 on SKU/exact fields. Cheap relevance win to fold into the
   keyword path whenever weakness #2 gets resolved.

### DOESN'T FIT (skip, with reasons)

- **Client-direct search-engine access** (Propcart mints scoped Typesense
  keys per browser session). Reasonable at their scale, but our two-stage
  embed+LLM rerank is the differentiator and must stay server-side; and we
  don't want a second search datastore while weakness #1 (split data
  plane) is unresolved. Postgres/pgvector is our consolidation path.
- **Anonymous field-gating** (GetSet strips price/vendor and disables
  filters until sign-in). A conversion tactic, not a search-quality
  feature; conflicts with our open-browse posture.
- **Raw cosine scores as the ranking** (GetSet has no rerank; their
  `score` IS the ordering, sorted ascending by distance). We already do
  better. Keep raw shortlist distances *internal* though — they're the
  natural instrument for MVP-1's zero-result/weak-result thresholding.

### WRONG (avoid, with reasons)

- **Outbound link proxying** (GetSet). Covered in EMULATE #1 — take the
  signal, not the mechanism. Latency + SPOF + strips referrer attribution,
  which is exactly backwards for our vendor-trust positioning.
- **Competing price fields** (GetSet: `price` vs `rentalPrice` vs
  `rentalPricePeriod`, present in inconsistent combinations). Our single
  `Price {amount, currency, unit}` with a controlled unit vocabulary is
  strictly better. Do not import their shape.
- **Everything-in-the-search-doc payloads** (GetSet returns full records
  per hit). We already have this problem ourselves (weakness #6) — the fix
  is projections everywhere, not bigger payloads.

### Implementation notes

All five GetSet-derived adoptions (#1–#5) are additive — an events insert,
a column + ingest hook, a jsonb column, a link table, a provenance column.
None restructure existing data. #6–#8 are the search-surface work and
should be sequenced with weaknesses #1/#2 (data-plane consolidation) and
coordinated with MVP-1. Competitive-intel side note: GetSet's `v=wb`
vendor code implies they carry Warner Bros inventory — one of our nine
blocked scrapers — via some non-public path; relevant to vendor outreach.
