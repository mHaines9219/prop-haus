# GetSet (wegetset.com) — capture notes

Captured 2026-08-31. Product: prop rental search aggregator, NY/LA/Atlanta/
Miami. "Searching over 1 million listings in NYC & LA." Marketing site at
wegetset.com, app at app.wegetset.com.

## Search endpoint

`POST https://app.wegetset.com/api/products/search`

- The search page reads `?q=<query>&city=<city>` from the URL and POSTs to
  this same-origin endpoint. City switches the result pool (verified NY vs
  LA return disjoint items).
- Response: `{ anonymousPreview?: true, docs: [{ score, product }] }`.
  Results sorted by `score` **ascending** — it is a cosine distance from a
  pure embedding search (lower = closer). No rerank stage: the raw vector
  distance is their entire ranking.
- No pagination params observed; result set appears capped.
- Anonymous vs authenticated is a field-level gate, not an access gate:
  logged out, `product` carries only id/title/description/quantity/
  dimensions/imageUrl (`anonymousPreview: true`); logged in, the full
  record below. Category/vendor filter UI is disabled until sign-in.

## Authenticated product record — field inventory

From `search-authenticated-20260831.json` (representative items excerpted
from a "brass desk lamp"-adjacent NY query; full response was ~45 docs with
the same shape):

| Field | Notes |
|---|---|
| `id` | Mongo-style object id |
| `title`, `description` | Raw scraped text. Many titles are tag-soup ("…, Fixtures, Brass, Desk Lamp, Lamps, Normal Wear And Tear, 7"W, 20"D, …") |
| `price` / `rentalPrice` / `rentalPricePeriod` | Inconsistent trio: items carry one, both, or neither; period ("week") only sometimes present. Messier than our `Price {amount, currency, unit}` |
| `quantity` | Includes 0 — unavailable items stay indexed and returned |
| `dimensions` | Free text, at least 4 formats observed |
| `imageUrl`, `imageHash` | Content hash alongside the URL; hash sometimes differs from URL filename (dedupe of optimized variants) |
| `sku` | Vendor SKU, sometimes empty |
| `vendor`/`vendorId`, `city`/`cityId` | Reference ids (duplicated legacy/new field pairs) |
| `url` | Outbound link. Direct vendor URLs for some vendors; proxied through `app.wegetset.com/api/products/vr?s=<sku>&v=<vendorCode>` for others (codes seen: `uspd`, `wb`) — click tracking + source obfuscation |
| `stagingOnly` | Row-level visibility flag |
| `searchCategories[]` | `{id, source: "ai"\|"tags", category}` — category assignments with pipeline provenance, multiple coexisting |
| `aiMetadata` | `{quantity, dimensions, description}` — AI-derived normalizations stored beside (never over) the raw fields; null where the AI pass hasn't run or found nothing. `dimensions` parsed to `{width, height, depth, length?}` strings; `description` is the tag-soup cleaned to a sentence |
| `isOriginalOf[]` | Ids of records this item is the canonical original of — duplicate linkage as first-class data |

## Ingest breadth (from `url` values)

They index vendor sites (omegacinemaprops.com, gilandroyprops.tv,
kendalls.com, pinaprops.com…), marketplaces (1stdibs), **competitor
platforms** (propcart.com shop URLs appear in results), and vendors only
reachable through their own proxy (`v=wb` — suggests Warner Bros inventory,
which is one of our blocked scrapers; they got it via partnership or a
non-public path).

## What felt notable in use

- Anonymous search works instantly with no gate; the paywall is on fields
  (price/vendor) and filters, not on searching. Conversion tactic.
- Result quality is embedding-only: good recall, mediocre precision
  ordering (no rerank).
