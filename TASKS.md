# TASKS.md — Active Workstreams

This is the task board for parallel agent work. Each task is written to be
self-contained: an agent should be able to read its section and start working
without further briefing.

## How to use this file (agents, read first)

- Pick ONE task. Do not start work on another agent's task.
- When you start a task, set its `Status` line to `in progress — <branch name>`
  and commit that change early so other agents see it.
- When you finish, set `Status` to `done — PR #<n>`.
- All new UI is Answer Print (see CLAUDE.md "Design Language" + DESIGN.md).
  Astryx was fully removed Aug 2026 — never reintroduce it.
- Migrations: files in `supabase/migrations/` are timestamp-ordered. Use the
  current date/time for new migration filenames to avoid collisions with
  parallel agents.
- Shared-file hotspots — coordinate or expect merge conflicts:
  `lib/types.ts`, `app/globals.css`, `components/ap/site-nav.tsx`,
  `lib/accounts.ts`.
- Fresh worktrees have no catalog data (`data/catalog.json` is gitignored).
  Rehydrate with `npm run db:dump` (pulls from Supabase).
- Repo conventions: Next.js App Router, TypeScript, Tailwind v4, Zustand,
  Supabase. Package manager: pnpm.

**NEVER get blocked on missing credentials, API keys, or external services.**
Build every task to a PLUG-AND-PLAY state:
- Missing API key / partner not chosen / service not provisioned → put the
  integration behind an interface, ship a mock/null implementation that
  succeeds locally, and read the real key from an env var. Add the var to
  `.env.local.example` with a placeholder value and a comment saying what to
  paste there. Swapping in the real service should require zero code changes
  beyond (at most) one adapter file.
- Missing data (seed contractors, vendor requirements, certificates, rates,
  copy) → invent realistic placeholder data and mark it clearly
  (`// PLACEHOLDER: replace with real data`) in a seed script or fixture so
  it's greppable and swappable.
- The demo path must work end-to-end with zero secrets: someone should be
  able to check out your branch, `pnpm dev`, and click through the full flow
  you built.
- Never hardcode a fake secret as if it were real, and never commit a real
  one. Placeholders live in `.env.local.example`; real values in `.env.local`
  (gitignored).
- Note anything that needs a real key/decision from Matthew in your task's
  Status line or PR description — then keep building. Do not stop and ask.

---

## MVP tasks

### MVP-1 · SEARCH — Finish the search function

**Status:** in progress — mHaines9219/biarritz (workable sub-items done; primary data gap still waiting on Matthew)
**Priority:** high
**Depends on:** incoming data (Matthew will specify what's missing)

**Context.** Search is the core discovery surface. It mostly works but is
incomplete: some data is missing from the catalog, and Matthew will provide
details on exactly what. Do NOT restructure the search pipeline until that
update lands.

**Current state:**

**Current state:**
- `app/api/search/route.ts` — AI search (POST, metered, auth required).
  Two-stage: semantic shortlist via embeddings → LLM rerank. Modes: `text`,
  `haiku`, `sonnet`, `haiku-then-sonnet`. Accepts image/PDF attachments.
- `app/api/keyword/route.ts` — public keyword search (GET), scores against
  name/category/description/enrichment tags.
- `app/api/browse/route.ts` — paginated browse with category/vendor facets.
- Data: ~90k items in Supabase `catalog.catalog_items` from 14 scraped vendors
  (`scrapers/`, configs in `lib/vendors.ts`). 9 vendors blocked (login walls,
  Cloudflare). Embeddings in `catalog.embeddings` (halfvec), built via
  `pnpm embed`. Enrichment (style/era/materials/colors/vibes/tags) via
  `pnpm enrich`.
- Search internals: `lib/search-index.ts`, `lib/search-modes.ts`,
  `lib/keyword-search.ts`, `lib/catalog-db.ts`.

**Known gaps (workable once unblocked, or if explicitly assigned):**
- Missing catalog data — the primary gap; specifics coming from Matthew.
- Zero-result queries are measured but not remediated (recall tuning on the
  embedding shortlist).
- `plate_mode` ingest heuristic (cutout vs photo detection for LightWell
  rendering) is specced in DESIGN.md but not implemented; all items default
  to cutout.
- Enrichment coverage is partial across the catalog.

**Deliverable:** search returns complete, correct results across the full
catalog once the missing data is ingested. Scope the concrete work when the
data update arrives.

---

### MVP-2 · CREW — Contractor hiring page

**Status:** done — PR #62
**Priority:** high
**Depends on:** nothing

**Context.** Productions need extra hands on set — delivery, load-in/load-out,
set dressing labor, general production assistance. Build a page where a user
can browse available contractors and request to hire them. Scope is
intentionally narrow for now: "extra hands / delivery-type jobs" only, not a
full labor marketplace.

**Current state:** greenfield. Nothing exists for contractors. Relevant
existing patterns:
- Auth/org model: `lib/accounts.ts` (Organization, Profile, Membership),
  session → org_id pattern in `app/api/projects/route.ts`.
- Org-scoped Postgres tables with RLS: see `supabase/migrations/`
  (`20260627181123_init_accounts.sql` is the reference).
- Answer Print page reference: `app/page.tsx` + `components/ap/`.

**Build:**
1. Migration: `contractors` table (name, headshot/photo, skills/service tags —
   e.g. `delivery`, `set-hands`, `load-in` — city, day rate or rate range, bio,
   active flag) and `crew_requests` table (org_id, contractor_id, requested
   dates, location, notes, status: `requested` → `confirmed`/`declined`).
   Contractors are platform-curated rows (seeded manually), not self-signup.
2. `/crew` page (Answer Print, NOT in `(legacy)`): browse contractors as a
   ruled grid/list per DESIGN.md. Photos render in LightWells.
3. Request flow: "Request crew" on a contractor → small form (dates, location,
   notes) → creates `crew_requests` row. Auth required (reuse the existing
   auth-gate pattern). Confirmation state in UI.
4. API: `app/api/crew/route.ts` (GET list, public) and
   `app/api/crew/requests/route.ts` (POST, auth, org-scoped).
5. Add "Crew" to site nav (`components/ap/site-nav.tsx`).
6. Seed script or seed migration with a handful of placeholder contractors so
   the page renders with real-shaped data.

**Out of scope:** payments/payouts, scheduling/calendars, contractor
self-service accounts, reviews/ratings, matching algorithms, non-labor vendor
categories (that's FUT-1 — but design the schema so a `category` field can
extend to it).

---

### MVP-3 · CHECKOUT — One-click checkout scaffold

**Status:** done
**Priority:** high
**Depends on:** nothing (coordinate with MVP-4: checkout will later trigger
COI issuance)

**Context.** One-click checkout is back in the MVP. The target experience: a
user with a cart clicks once and the order is placed — no multi-step checkout
form. Everything the platform needs (production details, rental dates,
contact, later payment method and insurance) lives on the org's profile so
checkout itself has nothing to ask. This task is the SCAFFOLD: the full flow
with real order records, with payment capture stubbed behind an interface.

**Current state:**
- Cart: `lib/cart-store.ts` — client-only Zustand store persisted to
  localStorage. Lines carry item id/source/name/images/sourceUrl/category.
- Cart page: `app/cart/page.tsx` (Answer Print).
- There is NO checkout, order model, or payment integration. A previous
  quote/vendor-request workflow was intentionally removed in
  `supabase/migrations/20260829130000_strip_workflow_to_folders.sql` — read it
  to see what was dropped; do not resurrect it wholesale. Orders are a new,
  simpler model.
- "Projects" (`lib/projects.ts`, `app/api/projects/*`) are saved-item folders,
  NOT orders. Leave them alone.

**Build:**
1. Migration: `orders` (org_id, status: `placed` → `processing` →
   `confirmed`/`cancelled`, rental start/end dates, delivery notes, totals
   nullable — many houses are quote-only) and `order_items` (order_id,
   snapshot of item: source, source_id, name, image, source_url, vendor,
   price at time of order). Org-scoped RLS like `projects`.
2. Org checkout profile: extend the org record (or a new `checkout_profiles`
   table) with the defaults one-click needs — production/company details,
   contact, default rental window behavior. Keep it minimal.
3. `POST /api/checkout` — auth required. Takes the cart lines + rental dates,
   creates order + order_items in one transaction, clears nothing client-side
   (client clears its own cart on 200). Idempotency key to prevent double
   submits.
4. Payment abstraction: `lib/payments/provider.ts` — an interface
   (`authorize`, `capture`, `refund`) with a `NullProvider` implementation
   that logs and succeeds. NO real Stripe/etc. wiring in this task.
5. UI (Answer Print): rebuild the cart page out of `(legacy)` with a single
   primary "Place order" action (plus a rental-date control if the org has no
   default), and an order confirmation page `/orders/[id]` showing the placed
   order. An `/orders` list page is optional but cheap — include it.
6. Post-checkout hooks: leave a clearly-marked extension point where COI
   issuance (MVP-4) and the future Spacelab handoff (FUT-2) plug in after
   order placement.

**Out of scope:** real payment processing, vendor-side confirmation flows,
availability checks, email notifications, pricing/quote negotiation.

---

### MVP-4 · COI — COI issuance flow via insurance API partner

**Status:** done — PR pending · needs: COI_PROVIDER env var once partner chosen (add to .env.local.example)
**Priority:** medium-high
**Depends on:** nothing. The partner API is not chosen yet, but that does not
block this task: build the entire flow behind the provider interface with the
mock provider, fully demoable end-to-end. The real adapter is a one-file
follow-up once Matthew picks the partner.

**Context.** Strategy change: Prop Haus will partner with an insurance API to
ISSUE COIs (certificates of insurance) directly in-product, instead of only
coordinating documents. The licensed partner underwrites/binds; Prop Haus is
the workflow and integration layer. Vendors require COIs before releasing
rentals, so this slots directly into the checkout flow: order placed → COIs
issued per vendor per that vendor's requirements.

**Current state:**
- `lib/insurance.ts` exists as unwired ghost code from a previous iteration:
  a `VENDOR_COI` requirements table (per-vendor coverage requirements) and
  `checkCompatibility()` logic evaluating an org's coverage against vendor
  requirements. Zero call sites. Reuse what's useful.
- The old documents/COI schema was DROPPED in
  `20260829130000_strip_workflow_to_folders.sql` (`documents`,
  `vendor_requests` tables, `organizations.insurance` column). Reference
  `20260627181123_init_accounts.sql` for the original shapes.
- No Anvil/e-signature integration exists in this repo.

**Build:**
1. Provider interface: `lib/coi/provider.ts` — operations roughly:
   `getOrCreatePolicy(org)`, `issueCertificate({ org, vendor, requirements,
   dates })` → certificate record with PDF URL, `getCertificate(id)`. Ship a
   `MockCoiProvider` that generates a fake certificate record. The real
   partner adapter is a follow-up once the partner is chosen.
2. Migration: restore an insurance profile on the org
   (`organizations.insurance` jsonb or a dedicated table) and add
   `certificates` (org_id, vendor id, order_id nullable, status: `pending` →
   `issued`/`failed`, coverage snapshot, document URL, expiry). Org-scoped
   RLS.
3. Vendor requirements: move/confirm per-vendor COI requirements as data
   (seed from `VENDOR_COI` in `lib/insurance.ts`; decide whether it lives in
   `lib/vendors.ts` config or a table — prefer a table so ops can edit).
4. Flow: from an order (MVP-3's post-checkout extension point) or manually
   from a vendor/org page — request COIs for each vendor in the order,
   evaluate the org's coverage vs requirements (`checkCompatibility` logic),
   issue via provider, store certificate.
5. UI (Answer Print): an insurance section in account/settings showing the
   org's coverage profile and issued certificates (status, vendor, expiry,
   download). Certificate rows are camera-report style data rows per
   DESIGN.md, not cards.
6. Copy discipline: the PARTNER issues/binds coverage. UI copy must not claim
   Prop Haus is the insurer.

**Out of scope:** choosing the partner (Matthew decides), real partner API
wiring, claims handling, broker workflows, W9/general document management.

---

### MVP-5 · REDESIGN — Site redesign

**Status:** Part A done — mHaines9219/hyderabad. Part B in progress — mHaines9219/sofia (see docs/design-direction-mvp5b.md for direction; implementing punch list).
**Priority:** high
**Depends on:** nothing

**Context.** We are still not happy with the design. Two distinct parts:

**Part A — migration: COMPLETE (Aug 30, 2026).** Every user-facing page is on
Answer Print. `app/(legacy)/` is deleted, and Astryx is fully removed: no
`@astryxdesign/*` dependencies, no Astryx CSS/provider wiring in the app
shell, no Astryx-based components. Tailwind's preflight now owns the CSS
reset. Do not reintroduce Astryx. Ongoing rules for new surfaces:
- Reuse/extend `components/ap/` (SiteNav, LightWell, BrowseGrid, ItemCard…).
- Every inventory photo goes in a LightWell — never a bare image tile.
- Rows for dense data, ruled grids with visible hairline seams, one gray
  family + tally-red accent, Spline Sans Mono for all data/numbers.
- Dark/light mode: dark is the default; a next-themes toggle in SiteNav
  flips a `.light` class on `<html>` whose token overrides live in
  `app/globals.css`. New tokens need values in both blocks.

**Part B — design direction iteration (blocked on input).** The Answer Print
language itself may need revision — Matthew hasn't said what specifically is
unsatisfying. Do NOT unilaterally invent a new design language. When
direction arrives, changes go through DESIGN.md first, then components.

---

### MVP-6 · BACKEND-OPT — Backend optimization (competitor API analysis)

**Status:** BLOCKED / on hold (2026-08-31) — do NOT pick up #2–5 yet. #1
outbound-click demand signal shipped (PR #78) and stays. Everything else is
frozen pending a strategy decision (see "Why blocked" below). #6–8 (search-
surface) remain deferred pending MVP-1 coordination regardless.
**Priority:** medium (paused)
**Depends on:** compare/contrast DONE + reviewed with Matthew (2026-08-31), but
now GATED on the direct-API-access outcome below.

**Why blocked (2026-08-31).** We're going to try to contact the prop houses
directly and hook into their own APIs rather than treat scraping as the only
ingest path. If those integrations land, the catalog's ingest/normalization
layer changes shape — vendor-native fields, real availability, canonical IDs
from the source — which would force us to redo any backend optimization built
against the current scraped-data model. So there's no point hardening the
scrape-era backend (imageHash, provenance jsonb, canonical/dup linkage,
category provenance) until we know what the data plane actually looks like.

Matthew's read: some inventory will *still* have to be scraped (not every house
will have or grant an API), so the eventual design is likely hybrid — API where
we can, scrape where we can't. That means #2–5 aren't cancelled, just deferred
until the ingest architecture is settled; several may survive largely intact but
should be (re)specced against the hybrid model, not the current one.

**Unblock when:** we know which prop houses will grant API access and roughly
what those APIs expose. At that point: revisit §4's EMULATE list against the
hybrid ingest model, re-scope #2–5, and resume one-PR-per-item.

**Next up — FROZEN (do not start; re-spec after unblock).** Each below is an
additive change from §4's EMULATE list against the *current scraped-data* model;
treat as historical spec until the ingest architecture is settled. Priority
order reflected Matthew's stated priorities: (a) vendor-popularity data, (b) UI
load speed, (c) AI-pipeline efficiency.

- **#2 imageHash (priority c — do next).** Content hash per image at ingest so
  AI passes scale with *change*, not catalog size: skip re-embed/re-enrich when
  a re-scrape returns an unchanged image; dedupe identical photos; later, key
  FUT-2 image-to-3D GLBs per hash. Shape: migration adds an `image_hash`
  column, ingest/load hook computes it, `pnpm embed`/`pnpm enrich` gain a
  "skip if hash unchanged" guard. Coordinate on the catalog-load path.
- **#3 AI-vs-source provenance (§4.3).** Namespaced jsonb (`ai_metadata`)
  beside immutable scraped fields so any AI pass is re-runnable with a better
  model without destroying source data. First applications: parsed dimensions
  (also needed by MVP-5b's camera-report placard) and a `Price.unit` backfill
  that never overwrites scraper-confirmed values.
- **#4 canonical/duplicate linkage (§4.4).** A canonical-item link (seed via
  imageHash from #2 + fuzzy title match) so search collapses cross-vendor dupes
  and shows "available from N vendors." Best done AFTER #2 (needs the hash).
- **#5 category provenance (§4.5).** A column recording which pipeline set a
  category (`ai` | `tags`) so AI recategorization is re-runnable/rollbackable
  without clobbering scraper-derived categories. Addresses the mapper-gap bug
  class from PRs #68/#70.

Sequencing note: #2 before #4 (dedup seeds off the hash). #3 and #5 are
standalone. All are additive — an events insert, a column + hook, a jsonb
column, a link table, a provenance column — none restructure existing data.

**#1 shipped (PR #78) — reference for the pattern:** signal collection only,
not ranking. `outbound_click` event (`lib/events.ts`) fired via
`navigator.sendBeacon` from `components/ap/outbound-link.tsx`, recorded by
`app/api/events/outbound-click/route.ts` (validates source/surface, auth-
optional, 204). Wired on the item-detail "View on {vendor}" CTA
(`surface: 'item_detail'`). Direct attributed href kept — took GetSet's signal,
not their proxy. FOLLOW-UPS left open: (i) a demand-ranked browse order that
reads this signal — browse still sorts by `id` in lib/catalog-db.ts:176;
(ii) additional surfaces (`project`, `order`) — the `surface` allow-list in
the route + component's union type extend in one line each.

**Context.** Matthew is analyzing competitors' products by capturing the
network responses behind their API calls. This task is a compare-and-contrast
of their backend design against ours, followed by implementing what's worth
adopting. Related to but SEPARATE from MVP-1 (search data completion) — do
not merge the two; coordinate if both are in flight since they touch the same
endpoints.

**The job, once material lands:**
1. Study the provided competitor captures alongside our own endpoints
   (`app/api/search`, `app/api/keyword`, `app/api/browse`, and any others the
   material covers): request/response shape, fields returned, data
   completeness, pagination/faceting, latency and caching behavior, error
   handling.
2. Produce a short written comparison sorted into three buckets:
   - things they got WRONG (avoid, with reasoning)
   - things that DON'T FIT our use case (note why, skip)
   - things we should EMULATE (each as a concrete, scoped backend change)
3. Review the "emulate" bucket with Matthew, then implement it.

**Out of scope:** scraping or probing competitor systems yourself — work only
from the captures and context Matthew provides.

### MVP-7 · CLIP — Save furniture from anywhere on the web (v1: paste a link)

**Status:** in progress — mHaines9219/asuncion · built + tests green. Flags for Matthew: (1) reused the EXISTING `project_items.metadata` jsonb column instead of adding a new `meta` column (it was unused; avoids a near-duplicate) — comment-only migration documents it; (2) `.env.local.example` is permission-locked in this workspace, so `CLIP_IMAGE_BUCKET=clips` must be added there by hand (image snapshotting is off until then — PassthroughStore hotlinks, demo works with zero secrets); (3) conscious sign-off wanted on copying retail images into our bucket vs hotlink-only (PassthroughStore is the hotlink-only posture).
**Priority:** medium-high
**Depends on:** nothing

**Context.** A competitor ships a Chrome extension that lets users "save" any
furniture image from retail sites (Wayfair etc.) into their project screen.
We want that capability. V1 is deliberately smaller: a link input on the
folder (project) screen — the user pastes a product listing URL (Wayfair
first), the server fetches the page, extracts the primary image + metadata,
and the item lands in the folder next to their saved catalog items. The
Chrome extension is FUT-3 and reuses this task's endpoint unchanged — build
the API as if the extension already existed.

**Working name in UI copy:** "Add from the web" / "clip". Clipped items are
reference material the user sourced themselves — they are NOT catalog
inventory, don't enter search/embeddings, and can't be checked out.

**Current state (the survey — don't re-derive it):**
- "Projects" are saved-item folders: `lib/projects.ts` (types + CRUD),
  `lib/projects-db.ts` (row mapping), UI at `app/projects/page.tsx` and
  `app/projects/[id]/page.tsx`, APIs at `app/api/projects/route.ts` and
  `app/api/projects/[id]/items/route.ts`.
- `ProjectItem` is already a snapshot (itemId, source, sourceId, name,
  image?, sourceUrl, category?) — exactly the shape a clip needs. The DB
  column `project_items.source` is plain `text`
  (`20260829130000_strip_workflow_to_folders.sql`), so clips need NO schema
  change to the source column; only the TS type is narrow.
- `ProjectItem.source` is typed as `Source` (the scraped-vendor enum in
  `lib/types.ts`). `SOURCE_META[item.source]?.name ?? item.source` fallbacks
  exist in `app/projects/[id]/page.tsx:54` and `app/cart/page.tsx`, but
  `components/ap/item-card.tsx:124` indexes without a fallback (clips never
  render there — keep it that way).
- Dedupe already works for free: `project_items` has unique
  `(project_id, item_id)` and `addItemsToProject` upserts with
  `ignoreDuplicates` — a deterministic itemId makes re-clipping a no-op.
- `cheerio` is already a dependency (scrapers use it). Scraper fetch
  conventions live in `scrapers/common/fetch.ts` (UA, retries, jitter) —
  that module is CLI-oriented (disk cache in `.scrape-cache/`); don't import
  it into a route handler, write a lean server-side fetch instead.
- `lib/safe-url.ts` allow-lists http/https for rendering hrefs. It is NOT an
  SSRF guard — it doesn't resolve hosts or block private ranges.
- `next.config.ts` images.remotePatterns already includes `**` — any https
  image host renders through `next/image` today.
- `app/api/projects/[id]/items/route.ts` casts the request body with zero
  validation (`as { items }`) — tighten while you're in there.

**Build:**

1. **Type widening (`lib/types.ts` — shared-file hotspot, coordinate).**
   `export const CLIP_SOURCE = 'clip' as const` and
   `export type SavedSource = Source | typeof CLIP_SOURCE`. Change
   `ProjectItem.source` (and `ProjectItemInput`) in `lib/projects.ts` to
   `SavedSource`. Identity for a clipped item:
   - `source: 'clip'`
   - `sourceId`: the canonical product URL (post-redirect, stripped of
     tracking params)
   - `itemId`: `clip:<sha1(sourceId)>` — deterministic, so the existing
     upsert dedupes re-clips of the same listing into the same folder.

2. **Migration: `project_items.meta jsonb null`.** Carries clip extras the
   snapshot columns don't have: `{ retailer, price: { amount, currency },
   description? }`. Timestamp-dated filename per the rules above. Map it
   through `lib/projects-db.ts`. Catalog-saved items leave it null.

3. **Extractor: `lib/clip/parse.ts`.** Pure function `parseListing(html,
   url) → ClipPreview | null` using cheerio. Extraction ladder, first hit
   wins per field:
   1. JSON-LD `Product` (`<script type="application/ld+json">`) — Wayfair
      publishes name/image/sku/offers here; handle `@graph` arrays.
   2. OpenGraph (`og:title`, `og:image`, `og:price:amount`) and
      `twitter:image`.
   3. Fallback: `<title>` + largest `<img>` by declared dimensions.
   Plus a per-retailer override table keyed by hostname
   (`lib/clip/retailers.ts`) for quirks — seed it with `wayfair.com`
   (prefer the highest-res `assets.wfcdn.com` image, strip `?resize`
   params). Unit-test the parser against 2–3 saved HTML fixtures (vitest is
   set up).

4. **Endpoint: `POST /api/clip` (auth required, org from session).** Body
   `{ url }`. Pipeline: validate → fetch → parse → snapshot image → return
   `ClipPreview { name, image, sourceUrl, retailer, price?, description? }`.
   The client then confirms and POSTs the item through the EXISTING
   `app/api/projects/[id]/items` route — /api/clip never writes to folders
   itself. This split is what lets the FUT-3 extension reuse it.
   - **SSRF guard (this is the security-critical part):** https only; DNS-
     resolve the host and reject private/loopback/link-local/metadata
     ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7);
     cap redirects at ~3 and re-check every hop; 10s timeout; ~3 MB HTML
     cap. Do this in a `lib/clip/safe-fetch.ts` with tests — `lib/safe-url.ts`
     alone is not sufficient.
   - **Bot walls:** send a realistic browser UA/accept headers. If the fetch
     comes back 403/challenge/unparseable, return a typed
     `{ error: 'unreadable' }` — the UI then falls back to manual entry
     (user pastes an image URL + name themselves, same ProjectItemInput
     path). Never a dead end.
   - Rate-limit per org (simple in-memory or reuse the usage-counter
     pattern in `lib/usage.ts`) — this endpoint fetches arbitrary URLs on
     our dime.

5. **Image snapshot: `lib/clip/image-store.ts`.** Retail CDN URLs rot and
   some check referers, so copy the image: interface `put(url) →
   storedUrl`, with `SupabaseImageStore` (public bucket `clips`, keyed by
   the itemId hash, content-type must be `image/*`, ~10 MB cap) and a
   `PassthroughStore` that returns the original URL when storage isn't
   configured/reachable. Wire the bucket name through
   `.env.local.example` (`CLIP_IMAGE_BUCKET=clips`). Demo path must work
   with zero secrets via the passthrough.

6. **UI (Answer Print, see DESIGN.md).** On `app/projects/[id]/page.tsx`:
   an "Add from the web" control — paste-a-link input (mono type), submit →
   preview row (image in a LightWell, name, retailer, price in Spline Sans
   Mono) → confirm saves to the folder. States: loading, unreadable-page
   fallback (manual entry), duplicate (already in folder). Then fix the two
   render paths for clips in the folder row list:
   - the row's detail link (`/item/<source>/<id>`, line 53) would 404 for
     clips — link clipped rows to `item.sourceUrl` (external, via
     `safeExternalUrl`) instead;
   - vendor label: for clips show the retailer from `meta` (fall back to
     the sourceUrl hostname, `www.` stripped), not `SOURCE_META` (which
     would print "clip").

7. **Validate the items route.** Add a zod schema for `ProjectItemInput` in
   `app/api/projects/[id]/items/route.ts` (and the create-with-items path
   in `app/api/projects/route.ts`): source must be a `SavedSource`, `image`
   and `sourceUrl` must pass `isSafeExternalUrl`, name/category length
   caps. Today it accepts anything.

**Out of scope for v1:** the Chrome extension (FUT-3); clips entering
search/embeddings/enrichment; adding clips to the cart or orders (they're
retail purchases, not rentals); multi-image galleries; clipping from a bare
image URL as the primary flow (it's only the unreadable-page fallback);
cleanup of orphaned snapshot images (note it, skip it).

**Flag for Matthew (don't stall on it):** clipping is user-initiated,
single-page, attributed, and links back to the retailer — Pinterest-shaped,
much lower risk than our bulk scrapers — but copying images into our bucket
from retail sites is worth a conscious sign-off. The PassthroughStore is
the fallback posture if he says hotlink-only.

---

### MVP-8 · JOBS — Jobs-in-progress dashboard (DripDome dashboard port)

**Status:** DONE (mHaines9219/cancun, 2026-08-31) — plan in docs/jobs-dashboard-plan.md
**Priority:** medium-high
**Depends on:** nothing (MVP-3 orders and MVP-2 crew already landed)

**Context.** Matthew's separate business dashboard
(mHaines9219/dashboard-ui, npm name `dripdome-dashboard`) centers on a
per-job dashboard: Job status entity → composable module tabs → task
kanban → overview stat tiles. We're porting the CONCEPT — one surface
showing all of a user's work in flight — not the stack (it's Express +
Prisma + Vite SPA + Google JWT auth; none of that carries over). The full
source analysis is in the plan doc, so do NOT clone or survey
dashboard-ui; everything needed is written down.

**The shape.** A "job" in Phase 1 IS an order, enriched with its crew
requests and COIs. No new `jobs` table, and no workflow columns back on
`projects` (they were deliberately stripped to folders —
`supabase/migrations/20260829130000_strip_workflow_to_folders.sql`).

**Build (full spec + file list in docs/jobs-dashboard-plan.md §3–5):**
1. Migration: per-line-item status on `order_items`
   (`pending|quoted|confirmed|unavailable` + `status_note`,
   `quoted_cents`) — matches DESIGN.md §9.10's canonical StatusToken
   states. New event types in `lib/events.ts`, written from checkout/crew/
   transition routes.
2. Status transitions: `PATCH app/api/orders/[id]/status` (order + item),
   `setOrderStatus`/`setItemStatus` in `lib/orders.ts`, and a PLACEHOLDER
   `pnpm simulate:vendor` script so the flow demos with zero secrets.
3. `GET /api/crew/requests` (today crew requests are fire-and-forget with
   no read path at all).
4. Extract `StatusToken` to `components/ap/status-token.tsx` from the
   local copy in `app/account/insurance/certificate-ledger.tsx`; adopt it
   there and in `app/orders/page.tsx` (which currently uses free-floating
   raw-Tailwind dots — a DESIGN.md §9.10/§13 violation).
5. `/jobs` page: stat-tile band + DESIGN.md §9.7 list rows (list view,
   NEVER a card grid; aggregate copy like "Newel confirmed 4 of 6 items.
   2 pending."), crew section, §9.9 empty state. `lib/jobs.ts` is the
   aggregation seam. Rows link to `/orders/[id]`, which gets enriched into
   the job detail (per-item tokens, per-vendor rollups, linked COIs) — no
   separate `/jobs/[id]`.
6. Nav: add "Jobs" to `components/ap/site-nav.tsx` (merge hotspot — keep
   the diff to one array entry). Middleware: add `/jobs` AND the
   already-missing session-reading routes (`/orders`, `/account`,
   `/api/checkout`, `/api/crew`, `/api/coi`) to the matcher — live
   token-expiry bug this task inherits and fixes.

**Out of scope:** vendor portal/emails, payments, the module system and
task kanban, AI summaries, notifications, realtime (all Phase 2 — FUT-4).

---

## Future tasks (not MVP — do not start unless assigned)

### FUT-1 · VENDOR-EXPAND — Book all vendor categories

**Status:** future
**Depends on:** MVP-2 (extends its schema)

Expand beyond props and crew to booking every production vendor category:
catering, styling, hair/makeup, equipment, locations support, etc. The
contractor model from MVP-2 generalizes: a `category` on the
contractor/vendor record, per-category browse pages or a unified directory,
same request-to-book flow. When building MVP-2, keep the schema
category-friendly so this is an extension, not a rewrite. No further spec
yet — scope with Matthew before starting.

### FUT-2 · SPACELAB — 3D set preview from cart

**Status:** in progress — claude/fut2-space-lab-integration-jwwfs3
**Depends on:** MVP-3 (hooks into post-checkout), Spacelab deployment

**Concept.** Spacelab is Matthew's separate project at
`/Users/matthewhaines/z_code/spacelab` (GitHub: mHaines9219/spacelab) — a
browser-based 3D room studio (Rust core compiled to WASM owns the scene
model; React 19 + three.js renders it). After checkout, the user gets a
"Build your set in 3D" option: every item from their order becomes a 3D
object they can arrange in a Spacelab room.

**Key Spacelab facts (verified against its repo):**
- Loads GLB models ONLY, via three.js GLTFLoader
  (`web/src/viewport.ts:505-623`).
- Assets come from its own catalog: `web/public/assets/catalog.json` —
  entries are `{ asset_id, blob (model path), dims_m {w,h,d}, category,
  tags, title, style, anchor, front }`. Models cannot be injected at
  runtime; the asset_id must exist in that catalog.
- Scenes are JSON (`SaveFile` envelope, `crates/wasm-bindings/src/lib.rs`);
  programmatic scene building exists via the WASM `Document` API:
  `set_rectangle(w, d)`, `add_furnishing(asset_id, ex, ey, ez)`, etc. Rooms
  can also be imported from a `room.json` file, or opened via
  `?project=<id>`.
- There is NO embed mode, no REST API, and it is not deployed anywhere yet.
  ~20 hand-authored models in its catalog today.

**Pipeline to build (phased):**
1. **Image → GLB generation.** Cart items only have photos
   (`images: string[]` on PropItem). Stand up a service that takes an item's
   best image and produces a GLB via an image-to-3D API (evaluate
   Meshy/Tripo/TRELLIS-class services), normalized with real-world dims
   where known (`dimensions` field on PropItem). Cache per catalog item —
   generate once, reuse for every user.
2. **Catalog bridge.** Publish generated GLBs + a Spacelab-format
   `catalog.json` (asset_id = `prophaus:<source>:<sourceId>`, dims from item
   data) to storage Spacelab can load from. Requires a small Spacelab change:
   load an additional remote catalog URL.
3. **Scene handoff.** On "Build your set in 3D": generate a `SaveFile` room
   JSON with a default rectangle room and each order item staged
   (`add_furnishing`/aside slots), hand it to Spacelab via `?project=<id>`
   against a shared Supabase record, or file import as the fallback.
4. **Deployment + entry point.** Deploy Spacelab (static Vite app, e.g.
   Vercel), link from the Prop Haus order confirmation page (MVP-3 leaves
   the extension point).

Cross-repo work is required in Spacelab (remote catalog loading, possibly a
trimmed embed route). Scope each phase with Matthew before starting.

### FUT-3 · CLIP-EXT — Chrome extension web clipper

**Status:** future
**Depends on:** MVP-7 (reuses its endpoint and item model)

The competitor-parity follow-up to MVP-7: a Manifest V3 Chrome extension so
users clip without leaving the retailer's site. Shape:
- **Surfaces:** right-click context menu on any image ("Save to Prop Haus")
  + a toolbar popup showing the parsed listing and a folder picker (fetched
  from `GET /api/projects`).
- **Payload:** the extension sends `{ pageUrl, imageUrl? }` to the same
  `POST /api/clip` from MVP-7 — an extension-supplied `imageUrl` wins over
  the parse ladder (extend the endpoint to accept it then); everything else
  (SSRF guard, snapshot, ProjectItemInput) is unchanged. The extension also
  has the page DOM in hand, so it can send extracted JSON-LD/OG directly
  when the server-side fetch would hit a bot wall — that sidesteps MVP-7's
  main failure mode.
- **Auth:** the deployed app's session cookie with CORS scoped to the
  extension origin (`chrome-extension://<id>`), or a per-org API token if
  cookie auth proves brittle. Decide then.
- **Not in scope until then:** Firefox/Safari ports, clipping full pages,
  screenshot-based clipping.

Requires the app to be deployed somewhere the extension can talk to. Scope
with Matthew before starting.

### FUT-4 · JOBS-PHASE-2 — Full DripDome dashboard port

**Status:** future
**Depends on:** MVP-8 (builds on its aggregation seam in lib/jobs.ts)

The rest of the dashboard-ui port, per docs/jobs-dashboard-plan.md §6:
task kanban (todo/in_progress/done), composable per-job module tabs (JSON
config), AI overview (summary/risks/next-steps via our existing Anthropic
SDK usage, not OpenRouter), and — once users run multiple orders per
production — a real `jobs` grouping entity spanning orders + crew + COIs.
Scope with Matthew before starting.

---

## Recommended agent/model per task (note for Matthew — token budget)

Rule of thumb: the briefs above already contain the research (file paths,
schemas, constraints), so most tasks are execution, not exploration — a
mid-tier model following a good spec beats a top-tier model re-deriving it.
Default to Sonnet; spend Opus/Fable only where taste or open-ended reasoning
is the bottleneck.

| Task | Model | Why |
|-------|-------------------|-----|
| MVP-1 | Sonnet | Data ingest/tuning against a known pipeline once your data arrives. |
| MVP-2 | Sonnet | Well-specced CRUD + UI; patterns to copy are named in the brief. |
| MVP-3 | Sonnet | Schema + transactional API, fully specced. Opus only if the order model needs rethinking. |
| MVP-4 | Sonnet | Interface + mock provider, fully specced. |
| MVP-5A | Opus for the first page, then Sonnet | Design taste matters; let Opus set the pattern on /search, then Sonnet replicates it per page cheaply. |
| MVP-5B | Opus/Fable | Open-ended design direction work — worth the spend, but only after you give direction. |
| MVP-6 | Opus/Fable for the analysis, Sonnet to implement | The compare/contrast judgment is the hard part; the resulting changes are scoped. |
| MVP-7 | Sonnet | Fully specced parser + endpoint + UI; the file survey is in the brief. |
| MVP-8 | Sonnet | Research done (docs/jobs-dashboard-plan.md has the source analysis, schema, and file list); pure execution against a spec. |
| FUT-1/2/3/4 | Opus/Fable to scope, Sonnet to build | Cross-repo architecture (Spacelab) needs the strong model briefly, not for the whole build. |

Token-burn guardrails:
- ONE agent per task, one task at a time per agent. Don't run two agents on
  the same task "for comparison."
- Agents: don't re-survey the repo — the Current state sections above are
  the survey. Read the named files, not the whole tree.
- No multi-agent workflows/ultracode for these — every task here is sized
  for a single agent.
- Cheapest sequencing: MVP-2/3/4 in parallel (disjoint files), MVP-5A after
  MVP-3 lands (avoids cart-page conflicts and double-migrating).

---

## Task index

| ID | Title | Status | Priority |
|-------|--------------------------------------|-----------------------------|----------|
| MVP-1 | Finish search (missing data) | in progress — data gap open | high |
| MVP-2 | Contractor hiring page (/crew) | done — PR #62 | high |
| MVP-3 | One-click checkout scaffold | done | high |
| MVP-4 | COI issuance via API partner | done — PR pending | medium-high |
| MVP-5 | Site redesign (A done, B in progress)| in progress | high |
| MVP-6 | Backend optimization (competitor API) | BLOCKED — awaiting direct-API access decision; #1 shipped | medium (paused) |
| MVP-7 | Web clipper v1 (paste a link) | in progress — asuncion | medium-high |
| MVP-8 | Jobs-in-progress dashboard | done | medium-high |
| FUT-1 | Book all vendor categories | future | — |
| FUT-2 | Spacelab 3D set preview | future | — |
| FUT-3 | Chrome extension web clipper | future | — |
| FUT-4 | Jobs Phase 2 (full dashboard port) | future | — |
