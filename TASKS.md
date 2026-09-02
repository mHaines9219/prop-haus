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
  `lib/accounts.ts`, and for the Sep 2026 rework `app/api/checkout/route.ts`
  (the `after()` hook block) and `app/orders/[id]/page.tsx`.
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

## THINGS_MATT_NEEDS_TO_PROVIDE (audit — Sep 2, 2026)

Everything below is a real blocker or an open ask that no agent can resolve.
Nothing here stops a demo: every flow runs with zero secrets behind a mock.
Each item names the task, what is needed, where it lands, and what stays
mocked or wrong until it arrives. When you close one, delete the line here
and update the task's Status line.

### Datasets and real data

| # | Task | What | Where it lands | Until then |
|---|------|------|----------------|------------|
| D1 | MVP-1 | The missing catalog data — you said you would specify what is absent. This is the primary search gap. | `scrapers/`, `catalog.catalog_items`, then `pnpm embed` / `pnpm enrich` | Search runs against ~90k items from 14 vendors; 9 vendors blocked. No agent restructures the search pipeline until this lands. |
| D2 | MVP-6 | Competitor API captures (network responses) — only if #2–5 unfreeze. | Handed to the agent; not committed | Backend-opt items #2–5 stay frozen (see D-blocker Q3 below). |
| D3 | MVP-2 | Real contractor rows (names, photos, skills, rates, bios). | Replace `20260830120001_crew_seed.sql` rows via admin or CSV import | `/crew` shows 6 invented placeholder contractors. |
| D4 | MVP-11 | Confirmed vendor order emails. Every `orderEmail` in `lib/vendors.ts` is a guessed `orders@<domain>` placeholder. | `lib/vendors.ts` (`PLACEHOLDER` comment at line 18) | Outreach is logged, not sent. Do not flip `MAIL_PROVIDER=resend` before this. |
| D5 | MVP-12 | Each vendor's real forms: which forms each house actually requires, the PDFs, and the correct field names. The seed rows for omega, hpr, ec, heritage, propheaven, universal are invented. | `vendor_forms` rows in `20260902171000_vendor_forms.sql` | Mock filler produces stub PDFs against placeholder field maps. |
| D6 | MVP-12 | Each vendor's real additional-insured wording and COI minimums. The wording seeded for hpr and universal is generic. | `vendor_insurance_minimums.additional_insured_wording` and limits | COI gap warnings compare against placeholder minimums. |
| D7 | MVP-13 | The real template catalog: which templates Prop Haus sells, descriptions, and prices. | `lib/templates/catalog.ts` (`PLACEHOLDER` at lines 63 and 75) | Checklist offers placeholder templates with invented prices. |
| D8 | FUT-1 | Real vendor data per category (catering, HMU, styling, equipment, locations). | New seed migration when FUT-1 is picked up | Category rows were seeded then retired; `/crew` is the only directory. |
| D9 | FUT-2 | A dimensions pass on the per-category placeholder table from someone who knows what a prop-house sofa measures. | `lib/spacelab/asset.ts` (`PLACEHOLDER` at line 58) | Items with no scraped dimensions get a category guess. |

### API keys and env vars

`.env.local.example` is permission-locked for agents, so every var below must
be added there by you. Set the real values in `.env.local` (gitignored).

| # | Task | Var(s) | What it unlocks | Until then |
|---|------|--------|-----------------|------------|
| K1 | MVP-11 | `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM`, `OUTREACH_FALLBACK_TO`, `OUTREACH` | Real vendor emails on the click. Needs D4 first. | Logging mail provider; nothing leaves the box. |
| K2 | MVP-12 | `FORMS_PROVIDER=anvil`, `FORMS`, `ANVIL_API_KEY`, `ANVIL_WEBHOOK_SECRET`, `ANVIL_ETCH_TEST` | Real PDF fill and e-sign. Needs D5 and the template eids (Q5). | Mock filler and mock sign page. |
| K3 | MVP-13 | `INTAKE_PROVIDER`, `INTAKE_MODEL`, `OPENROUTER_API_KEY` | The model reads the project description instead of keyword heuristics. No code change. | `MockIntakeExtractor`. |
| K4 | MVP-7 | `CLIP_IMAGE_BUCKET=clips` plus the Supabase Storage bucket itself | Snapshotting clipped images into our bucket. Gated on Q4. | `PassthroughStore` hotlinks retailer images. |
| K5 | FUT-2 | `SPACELAB_MODEL_PROVIDER`, `MESHY_API_KEY` or `TRIPO_API_KEY`, `SPACELAB_ASSET_BUCKET` (a public Supabase Storage bucket), `SPACELAB_PREWARM`, `NEXT_PUBLIC_SPACELAB_URL`, `NEXT_PUBLIC_SITE_URL` | Real image-to-3D and the one-click "Open in Spacelab" link. Needs Q7 and X1. | Mock provider ships photo-mapped boxes; user downloads the room file. |
| K6 | all | Document the remaining vars code already reads: `PAPERWORK_BUCKET`, `CATALOG_DATABASE_URL`, `DATABASE_URL`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME`, `OPENROUTER_MODEL`, `OPENROUTER_EMBED_MODEL`, `OPENROUTER_ENRICH_MODEL`, `EVAL_QUERY_MODEL`, `ALLOW_SKIP_DB_TESTS`, `ALLOW_PRIVILEGED_LOAD` | A complete example file. Agents cannot verify which of these are already documented. | Diff the list against the file. |

### Decisions and answers

| # | Task | Question | Unblocks |
|---|------|----------|----------|
| Q1 | MVP-5B | What specifically is unsatisfying about Answer Print? The sofia punch list (docs/design-direction-mvp5b.md §61) needs nothing to build; after it ships, react to it. If the language itself is wrong, changes go through DESIGN.md first. | The next design iteration. |
| Q2 | MVP-6 | Which prop houses will grant direct API access, and roughly what those APIs expose? | Re-scoping backend-opt #2–5 against the hybrid ingest model. |
| Q3 | MVP-6 | Do #2–5 unfreeze at all, or is scraping-era hardening cancelled? | Whether D2 is needed. |
| Q4 | MVP-7 | Sign-off: copy retailer images into our bucket, or hotlink only? Also confirm reusing the existing `project_items.metadata` column instead of a new `meta` column. | K4. |
| Q5 | MVP-12 / MVP-13 | Upload each vendor PDF and each Prop Haus template to Anvil and paste the eids into `vendor_forms.anvil_template_eid` and `lib/templates/catalog.ts`. | Real fill; K2. |
| Q6 | MVP-13 | When does `TEMPLATES_INCLUDED_ON_FREE` flip to false? Templates are free on every plan during the MVP. | Template commerce. |
| Q7 | FUT-2 | Pick an image-to-3D service: Meshy, Tripo, or self-hosted TRELLIS-class. Compare cost per generation, quality on a single product photo, turnaround, sync vs job-based. | K5, one adapter file. |
| Q8 | FUT-2 | Should checkout pre-generate models once generation costs money (`SPACELAB_PREWARM`)? Are vendors comfortable with 3D derivatives of their listing photos? | Going public with Spacelab. |
| Q9 | FUT-1 | Equipment and location-support categories; per-category request fields (head count, kit fees); more filters on `/crew` or their own directories; ezCater partnership vs MealMe pilot for catering. | Scoping FUT-1. |
| Q10 | FUT-3 | Extension auth: deployed session cookie with CORS scoped to the extension origin, or a per-org API token? | Scoping FUT-3. |
| Q11 | MVP-11 | Crew request emails (step 9 follow-up): approve adding `contact_email` to contractors, a `crew` template, and `crew_request_id` on outbound messages. | The follow-up PR. |

### Cross-repo and deployment

| # | Task | What | Unblocks |
|---|------|------|----------|
| X1 | FUT-2 | Apply the two Spacelab patches (remote catalog loading with absolute blob URLs, `?room=` open) from docs/spacelab-integration.md §3 and deploy the static Vite app. | K5's `NEXT_PUBLIC_SPACELAB_URL`. |
| X2 | FUT-3 | Deploy Prop Haus somewhere the Chrome extension can reach. | FUT-3 start. |
| X3 | MVP-11 | A sending domain in Resend with the `orders+<orderId>@<domain>` reply-to address. FUT-5 needs its inbound webhook on the same domain. | K1 and FUT-5. |

### Board housekeeping

- MVP-7's Status line says in progress, but PR #79 merged Sep 1. Update it
  once Q4 is answered.

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

**Status:** done — PR #62. Sep 2, 2026: `/crew` became the single directory
with a role filter (production assistants, delivery) — see
`lib/crew.ts` + `components/crew/crew-directory.tsx`. The `/book` category
pages from the FUT-1 scaffold were removed (see FUT-1).
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

**Status:** done — PR #63. Sep 2026: the cart still asks for dates/notes at
checkout; MVP-10 removes that and MVP-11/12 fill the post-checkout hooks.
**Priority:** high
**Depends on:** nothing

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
- "Projects" (`lib/projects.ts`, `app/api/projects/*`) are productions that
  own scene folders of saved items plus one paperwork folder — the Dashboard
  tab (`/projects`). NOT orders. Leave them alone.

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

### MVP-4 · COI — COI issuance via insurance API partner

**Status:** RETIRED (Sep 2, 2026). The insurance API partnership did not work
out; Prop Haus will not white-label, issue, or broker COIs. The code from
PR #65 (`lib/coi/*`, `/api/coi/*`, `certificates`, `/account/insurance`) is
removed by MVP-9. What survives, re-homed by MVP-10 and MVP-12: the org's
insurance data (now "insurance on file", with the production's OWN COI PDF),
per-vendor coverage minimums as data, and `checkCompatibility()` as a
warning in the outreach preview. Do not build on `lib/coi/` — pick up MVP-9
instead.
**Priority:** —
**Depends on:** —

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
- "Projects" are productions with folders (since
  `20260902120000_project_folders.sql`): any number of SCENE folders holding
  saved items, plus ONE PAPERWORK folder holding uploaded documents.
  `lib/projects.ts` (types + CRUD), `lib/projects-db.ts` (row mapping),
  `lib/paperwork.ts` (upload validation). UI: `app/projects/page.tsx`
  (Dashboard), `app/projects/[id]/page.tsx` (folder list),
  `app/projects/[id]/folders/[folderId]/page.tsx` (scene items / paperwork
  documents). APIs: `app/api/projects/route.ts`,
  `app/api/projects/[id]/folders/*`, and the pre-folders
  `app/api/projects/[id]/items/route.ts` (optional `folderId`; defaults to
  the first scene folder — the FUT-3 extension contract).
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
requests and COIs. (Sep 2026: COIs are gone — MVP-9 swaps them for
outreach messages and paperwork documents from MVP-11/12.) No new `jobs` table, and no workflow columns back on
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

## MVP rework (Sep 2026) — the one-click order pipeline

**Why.** The COI white-label partnership is off (see CLAUDE.md "MVP Scope").
The new center of gravity is the click itself: placing an order must also do
everything a coordinator would do next. After MVP-9 through MVP-12 land, one
click on the cart:

1. creates the order (MVP-3, exists);
2. sends one email per vendor, pre-written from the cart + org profile and
   shown on the cart beforehand so the user can read or edit any of them
   (MVP-11);
3. fills every vendor form we have an Anvil template for from the org
   profile, stores the PDFs on the order, attaches them to that vendor's
   email, and stages anything that needs the user's signature as an Anvil
   e-sign packet (MVP-12);
4. shows all of it on the order page: sent messages with statuses,
   documents with a "Sign" action where needed (MVP-11 + MVP-12).

Sequencing: MVP-9 and MVP-10 first (they are disjoint and both small); then
MVP-11 and MVP-12 in parallel (disjoint files; they meet only at the
checkout route's `after()` block and the order page, both of which each task
touches in one clearly-marked region).

Hard rules for every task in this group:
- Prop Haus never signs, initials, or dates a signature block for anyone.
  Signatures are the user's own via Anvil Etch, or the form is `manual`.
- Prop Haus never produces a certificate of insurance. The production's
  broker does. We store, attach, and request.
- Copy never says "insured by", "covered by", "issued by Prop Haus", "we
  handle COIs". It says "filled from your profile", "you sign", "your COI on
  file". Search `how-it-works.tsx` and the order/account pages before
  merging.
- Review is optional, never a gate, and never a timer. The drafts are
  visible and editable on the cart before the click; the click sends them
  as they stand. No hold, no send-later, no second send step.
- Everything demoable with zero secrets: `LogMailer` and `MockFormFiller`
  are the defaults.

---

### MVP-9 · RETIRE-COI — Remove COI issuance, keep the data that still matters

**Status:** done — PR #88
**Priority:** high (unblocks MVP-11/12's copy and jobs surfaces)
**Depends on:** nothing. Land BEFORE MVP-10 to avoid both tasks editing
`/account`.

**Context.** MVP-4 built a full mock COI issuance pipeline. The partnership
is off and the product must not look like it issues certificates. Remove the
issuance path; keep the org's insurance data (it feeds the outreach email
and the Anvil COI request form) and the per-vendor minimums (they become a
warning in the outreach preview).

**Current state (the survey — don't re-derive it):**
- Issuance: `lib/coi/provider.ts` (interface + `MockCoiProvider`),
  `lib/coi/post-checkout.ts` (`triggerCoiIssuance`, never wired — the
  checkout route only has a commented-out call), `lib/coi/requirements.ts`
  (`VendorCoiRequirement`, `checkCompatibility`).
- Routes: `app/api/coi/route.ts` (POST issue), `app/api/coi/certificates/route.ts`
  (GET list). Both in `middleware.ts`'s matcher (`/api/coi/:path*`).
- Schema: `20260830140000_coi_issuance.sql` — `organizations.insurance_profile`
  jsonb, `vendor_coi_requirements` table (seeded, PLACEHOLDER values),
  `certificates` table.
- UI: `app/account/insurance/{page,actions,insurance-profile-form,certificate-ledger}.tsx`;
  `app/account/page.tsx` links to it and shows a "COIs issued" tile;
  `app/jobs/page.tsx` shows a "COIs issued" stat tile, a per-job
  "n/m COIs" fragment (lines ~93, ~115–155) and empty-state copy naming
  COIs (~195); `app/orders/[id]/page.tsx` renders a "Certificates" section;
  `components/ap/status-token.tsx` exports `coiStatusSpec`;
  `components/ap/how-it-works.tsx:40` says "We handle COIs".
- Aggregation: `lib/jobs.ts` joins `certificates` into `Job.certificates`
  and `JobsStats.coisIssued/coisPending`.
- Plans: `lib/plans.ts` entitlement `coiAutomation`.
- Docs: `docs/jobs-dashboard-plan.md` references COIs (historical; leave).

**Build:**
1. Migration (timestamped now): drop `public.certificates`; rename
   `vendor_coi_requirements` → `vendor_insurance_minimums` (same columns; it
   is now "what this vendor's COI must show", not "what we will issue").
   Keep `organizations.insurance_profile`; MVP-10 reshapes it. Comment the
   migration with the strategy change.
2. Delete `lib/coi/provider.ts`, `lib/coi/post-checkout.ts`, `app/api/coi/`,
   `app/account/insurance/certificate-ledger.tsx`. Remove `/api/coi/:path*`
   from the middleware matcher and the commented `issueCoisForOrder` line
   from `app/api/checkout/route.ts`.
3. Move `lib/coi/requirements.ts` → `lib/insurance/minimums.ts` with the
   `InsuranceProfile` type moved in from the deleted provider file (MVP-10
   extends it). `checkCompatibility` stays; rename the table reader to match
   the new table name.
4. `app/account/insurance/` becomes a plain "Insurance on file" page: the
   existing profile form (named insured, limits, expiry) minus any
   "certificates are generated at checkout" copy. MVP-10 folds it into the
   order profile; keep this step minimal (copy + delete the ledger column).
5. `lib/jobs.ts`: drop `certificates` from `Job`/`JobDetail` and
   `coisIssued/coisPending` from `JobsStats`. Replace with placeholders MVP-11
   and MVP-12 will fill: `messagesSent: number`, `documentsPending: number`
   (both 0 for now, computed from tables that don't exist yet is NOT
   required — hardcode 0 with a `// MVP-11 / MVP-12 fill this` comment).
6. UI: remove the Certificates section from `/orders/[id]`; swap the "COIs
   issued" tiles on `/account` and `/jobs` for "Vendors notified" (count of
   distinct vendors across in-flight orders — derivable today from
   `summarizeOrder`); drop the "n/m COIs" fragment and the COI mention in the
   jobs empty state ("Build a cart and place an order to start tracking
   vendor confirmations and crew here."); delete `coiStatusSpec`; rewrite
   `how-it-works.tsx:40` to "We write the vendor emails and fill the
   paperwork from your profile, so the truck arrives loaded and you show up
   ready." (no COI claim).
7. `lib/plans.ts`: rename `coiAutomation` → `outreachAutomation` (free:
   true in MVP — gating comes later; leave a comment), keep
   `paperworkGeneration` (MVP-12 uses it). Fix the one call site if any
   (`grep -rn coiAutomation`).
8. `pnpm test` and `pnpm build` green. Grep the tree for `coi`, `COI`,
   `certificate`, `insurer` and make sure every remaining hit is one of:
   the paperwork-folder copy ("COIs, W9s, invoices, call sheets" — that's
   the user's own uploads, fine), the new minimums module, or CLAUDE.md.

**Out of scope:** the new order profile (MVP-10), any email or Anvil work.

---

### MVP-10 · ORDER-PROFILE — Everything the click needs, on the org

**Status:** done — PR #89
**Priority:** high
**Depends on:** MVP-9 (edits `/account` too; land after it)

**Context.** One-click only works if nothing is asked at checkout. Today the
cart still shows rental-date inputs and a delivery-notes box, and the org
profile has only `checkout_profile` (production name, contact, phone,
default rental window days). MVP-11 and MVP-12 need much more: legal entity
details for forms, an accounts-payable contact for vendor account
applications, a delivery address, the production's own COI PDF plus broker
contact, and a recorded authorization to complete forms on the org's
behalf. This task is the single "Order profile" page and the cart
simplification that follows from it.

**Current state:**
- `organizations.checkout_profile` jsonb (`20260830130000_orders_checkout.sql`),
  typed as `CheckoutProfile` in `lib/orders.ts`, read/written by
  `app/api/checkout/profile/route.ts` (GET/PATCH). There is NO UI for it.
- `organizations.insurance_profile` jsonb + `InsuranceProfile` type (after
  MVP-9: `lib/insurance/minimums.ts`), edited at `/account/insurance`.
- `app/cart/page.tsx`: date inputs + delivery notes + "Place order" button,
  posts to `/api/checkout` with lines, dates, notes, idempotency key.
- `app/account/page.tsx`: profile + org + activity tiles; links to
  `/account/insurance`.
- Paperwork uploads: private `paperwork` bucket, validation in
  `lib/paperwork.ts` (`checkPaperworkFile`, `paperworkBucket`), upload path
  in `app/api/projects/[id]/folders/[folderId]/documents/route.ts` — copy
  its storage pattern; do NOT couple the COI upload to a project.
- Org/profile types: `lib/accounts.ts` (hotspot — keep the diff to a type
  addition).

**Build:**
1. Migration: replace the two jsonb columns with one
   `organizations.order_profile jsonb not null default '{}'` (migrate
   existing `checkout_profile` + `insurance_profile` values into it in the
   same migration, then drop them). Shape, typed as `OrderProfile` in a new
   `lib/order-profile.ts`:
   ```
   company:   { legalName, dba?, entityType?: 'llc'|'corp'|'sole_prop'|'other',
                address: { line1, line2?, city, state, zip },
                billingAddress?: same shape, phone?, website? }
   contacts:  { ordering: { name, email, phone? },
                accountsPayable?: { name, email, phone? } }
   defaults:  { rentalWindowDays?, deliveryAddress?: address, deliveryNotes? }
   insurance: { carrier?, policyNumber?, glLimit?, aggregateLimit?,
                workersCompLimit?, additionalInsuredAvailable?, expiresAt?,
                broker?: { name, email, phone? },
                coiDocument?: { storagePath, name, uploadedAt } }
   authorization: { formsOnBehalf: boolean, acceptedAt?, acceptedByUserId? }
   ```
   Tax IDs (EIN) are NOT stored in this task: MVP-12 decides per form
   whether a form needs one and, if so, collects it at sign time through
   Anvil rather than persisting it here. Leave a comment saying so.
2. `lib/order-profile.ts`: `getOrderProfile(orgId)`, `updateOrderProfile`,
   and `orderReadiness(profile) → { ready: boolean; missing: string[] }`
   listing human labels ("Ordering contact email", "Delivery address",
   "Authorization to complete forms"). Readiness for the CLICK requires:
   company legal name, ordering contact name + email, delivery address (or a
   default rental window + delivery notes as a fallback), and
   `authorization.formsOnBehalf`. Insurance is NOT required to order — its
   absence becomes a note in the outreach email ("COI to follow").
3. COI upload: `POST /api/account/insurance/coi` (multipart, one PDF/image,
   `checkPaperworkFile`), stored at `orgs/<orgId>/coi/<uuid>.<ext>` in the
   paperwork bucket; `GET` mints a 60s signed URL like the project document
   route. Replacing a COI overwrites the pointer (keep the old object; note
   cleanup as skipped).
4. `/account/profile` page (Answer Print): one page, sectioned like
   `/account` (mono section labels, camera-report field rows), editing the
   whole `OrderProfile`. Sections: Company, Contacts, Delivery defaults,
   Insurance on file (fields + COI upload row + broker), Authorization (a
   single checkbox with the exact sentence: "Prop Haus may complete vendor
   forms and send vendor requests using the information above. I sign
   anything that needs a signature." — store `acceptedAt` + user id when
   checked). Retire `/account/insurance` into this page (redirect the old
   path). `/account` gets a readiness row: "Ready to order" token, or "2
   things missing before one-click" linking here.
5. Cart: remove the date inputs and notes box from the default state
   (MVP-11 adds the email disclosure under this panel and renames the
   button; keep the panel self-contained). The panel shows the defaults it
   will use (rental window computed from
   `defaults.rentalWindowDays` starting the next business day, delivery
   address) in mono, with a quiet "Change for this order" disclosure that
   reveals the existing inputs. If `orderReadiness` fails, the button is
   replaced by the missing list + a link to `/account/profile` (fetch
   readiness from a new `GET /api/checkout/readiness`). Keep the
   §11 totals label "Estimate, pending vendor quotes".
6. `POST /api/checkout`: resolve rental dates and delivery address from the
   profile when the body omits them; refuse (422, listing `missing`) when
   readiness fails so the API is one-click-safe even without the UI.
   Snapshot the resolved values onto the order (`delivery_address jsonb`
   column on `orders` — add in this task's migration) so MVP-11's emails read
   the order, not the live profile.
7. Middleware: `/api/account/:path*` joins the matcher.

**Out of scope:** payment method on the profile, multi-production profiles
(one org = one profile for now; note it), any email or PDF work.

---

### MVP-11 · OUTREACH — Pre-written, batched vendor emails, sent with the click

**Status:** done — PR #90 (built 1–8; step 9 crew request emails left as follow-up: needs `contact_email` on contractors, a `crew` template, and `crew_request_id` on outbound_messages. Needs from Matthew: real vendor `orderEmail`s in lib/vendors.ts, RESEND_API_KEY + MAIL_FROM, and the MAIL_PROVIDER/RESEND_API_KEY/MAIL_FROM/OUTREACH_FALLBACK_TO/OUTREACH vars added to .env.local.example.)
**Priority:** high
**Depends on:** MVP-10 (reads `order_profile` and the snapshotted order
fields; extends its cart panel and checkout route). Coordinate with MVP-12 on
`app/api/checkout/route.ts` and `app/orders/[id]/page.tsx` — each task adds
ONE clearly-fenced block to each.

**Context.** After the click, a coordinator would email each prop house:
here is who we are, here is what we want to hold, for these dates,
delivering here, COI attached, please quote and confirm. The platform
writes those emails before the click, shows them on the cart if the user
wants to look, lets them edit any body, and sends the whole batch when the
order is placed. There is NO timer, NO hold, NO separate send step: the one
click places the order and sends the requests. Review means "open the draft,
read it, change it if you like" — nothing waits on it.

**Current state:**
- Nothing sends email anywhere in the repo. No mail dependency.
- Checkout: `app/api/checkout/route.ts` runs post-checkout hooks in
  `after()` (the Spacelab prewarm is the pattern — non-fatal, skippable by
  env). Order shape in `lib/orders.ts` (`Order`, `OrderItem` with
  `vendor`, `source`, `sourceUrl`, `image`), per-vendor grouping already
  done by `summarizeOrder`.
- Cart: `app/cart/page.tsx` — after MVP-10, one "Place order" button over a
  defaults panel with a "Change for this order" disclosure. Cart lines live
  client-side in `lib/cart-store.ts` (Zustand, persisted).
- Vendor config: `lib/vendors.ts` (`VENDORS` keyed by `Source`, with
  `website`, `notes`, and a `coiStatus` field that is now meaningless —
  remove it). No vendor email addresses exist anywhere.
- Order page: `app/orders/[id]/page.tsx` (server component, items grouped
  by vendor, StatusTokens). Jobs seam: `lib/jobs.ts` (MVP-9 leaves
  `messagesSent` at 0 for this task to fill).
- Events: `lib/events.ts` `EVENT_TYPES` (add types here; no migration).
- Status transitions from vendors are still manual: `PATCH
  /api/orders/[id]/status` + `pnpm simulate:vendor`. Leave them.

**Build:**
1. Mail provider: `lib/mail/provider.ts` — interface
   `Mailer.send({ to, cc?, replyTo, subject, text, html, attachments?:
   { filename, content: Buffer | storagePath, contentType }[] }) →
   { providerMessageId }`. Ship `LogMailer` (default: logs the envelope and
   the first 500 chars, returns a fake id) and `ResendMailer` (reads
   `RESEND_API_KEY`, `MAIL_FROM`; use plain `fetch` against Resend's REST
   API — no SDK dependency needed). Factory reads `MAIL_PROVIDER=log|resend`.
   Add all three vars to `.env.local.example` with comments.
2. Vendor addresses: add `orderEmail?: string` to `Vendor` in
   `lib/vendors.ts`. Seed every vendor with a `PLACEHOLDER` address of the
   form `orders@<vendor-domain>` and a `// PLACEHOLDER: confirm with vendor`
   comment; Matthew replaces them. Add `OUTREACH_FALLBACK_TO` env: when a
   vendor has no address, the message goes there (ops mailbox) with a
   "[needs vendor address]" subject prefix instead of being dropped.
3. Composer: `lib/outreach/compose.ts` — pure function
   `composeOutreach({ lines, rentalStart, rentalEnd, deliveryAddress,
   profile, vendors }) → Draft[]`, one per vendor across the lines. It takes
   cart-shaped input (not an `Order`) so the SAME function produces the
   pre-click preview and the post-click send. Template (plain text first,
   HTML second, same words), Copy Voice §11: sentence case, terse, no
   exclamation points. Subject: `Hold request · <production name> · <rental
   start>–<end>`. Body: who (company legal name / DBA, ordering contact),
   what (each item as name + vendor item link, and the item photo in the
   HTML version), when (rental window), where (delivery address), paperwork
   ("COI on file attached" or "COI to follow from our broker <name>";
   "Completed <form names> attached" is appended at send time from
   `order_documents` when MVP-12 has produced any), ask ("Please confirm
   availability and send a quote. Reply to this email."), signature
   (contact name, phone, "Sent via Prop Haus on behalf of <company>").
   Reply-to is the ordering contact; cc the AP contact when present. If the
   vendor has minimums (`vendor_insurance_minimums`) and the profile's
   insurance fails `checkCompatibility`, the draft carries
   `warnings: string[]` for the preview (NOT included in the email body).
   Unit-test the composer with vitest against a fixture: one vendor with
   COI, one without, one with no address.
4. Preview endpoint: `POST /api/checkout/preview` (auth) — body is the same
   shape as `/api/checkout` (lines + optional date/address overrides);
   returns `{ drafts: Draft[], readiness }` with the resolved defaults
   applied. Pure read, writes nothing.
5. Migration: `outbound_messages` (id, org_id, order_id, vendor_id,
   vendor_name, to_email, cc_emails text[], reply_to, subject, body_text,
   body_html, attachments jsonb [{ name, storagePath, contentType }],
   status `sending|sent|failed`, sent_at, provider_message_id, error,
   edited boolean default false, created_at, updated_at). Org-scoped
   SELECT via RLS like `orders`; writes service-role only. No scheduling
   columns — there is nothing to schedule.
6. Checkout: `POST /api/checkout` accepts an optional
   `messages?: { vendorId, subject, bodyText }[]` — the user's edited
   drafts from the cart. In the route: create order (exists) → in
   `after()`: MVP-12's paperwork block first (so attachments exist), then
   `sendOrderOutreach(order, { overrides: body.messages })` in
   `lib/outreach/send.ts`: recompose from the ORDER snapshot, apply
   overrides by vendorId (an override replaces subject/body and sets
   `edited`; the HTML version is regenerated from the edited text as
   paragraphs), attach the COI on file and any `order_documents` for that
   vendor, insert the row as `sending`, call the mailer, mark `sent` or
   `failed` with the error. Never throws out of `after()`; skippable with
   `OUTREACH=off`. Record `outreach_sent` / `outreach_failed` events.
7. Cart UI (Answer Print): the button reads "Place order and send to 3
   vendors" (count live from the lines). Under the defaults panel, a quiet
   disclosure row "Review the emails" (mono, chevron) that, when opened,
   fetches `/api/checkout/preview` and lists one row per vendor: vendor
   name, to-address in mono, subject, any composer warning in 12px mono
   `tally-text`. Each row expands (or opens a §9.6 right drawer, 440px,
   `rail` entrance — pick one, drawer preferred on desktop) to the full
   plain-text body in a `surface-inset` block that is directly editable
   (textarea, `hooks/use-auto-resize-textarea.ts`) plus the subject and
   the attachment names. Edits are held in cart page state and posted as
   `messages` with the click; a "Reset to draft" ghost link discards an
   edit. Nothing here is required: a user who never opens the disclosure
   gets the drafts as written. No hold, no send-later, no per-message send.
8. Order page: a "Vendor requests" section above the items. Header line:
   "Sent to 3 vendors." or "Sent to 2 of 3 vendors. 1 failed." One row per
   message (§9.7): vendor, to-address in mono, StatusToken
   (`messageStatusSpec` added to `status-token.tsx`: sending→PENDING
   SENDING, sent→CONFIRMED SENT, failed→UNAVAILABLE FAILED), sent time in
   mono, and a "View" link opening the sent message read-only in the same
   drawer. Failed rows get a ghost "Retry" calling `POST
   /api/outreach/[id]/retry` (auth, org-scoped, re-sends the stored body;
   the only outreach route besides the preview). Fold `messagesSent` into
   `lib/jobs.ts` and the `/jobs` per-row copy ("Sent to 3 vendors. Newel
   confirmed 4 of 6 items."). Matcher: `/api/outreach/:path*`,
   `/api/checkout/:path*`.
9. Crew requests get the same treatment in a trailing step, cheaply: the
   contractor request form previews its one message inline (same composer
   with a `crew` template), the submit sends it, keyed by `crew_request_id`
   (nullable column alongside `order_id`). Contractors need a
   `contact_email` (add if absent; PLACEHOLDER values). If this pushes the
   task over budget, leave it as a documented follow-up in the Status line
   rather than half-built.

**Out of scope:** inbound email parsing / auto-updating item status from
replies (FUT-5), vendor portal, SMS, per-vendor template customization,
send-later or scheduling of any kind, editing after send, the Anvil
documents themselves (MVP-12 — this task only attaches what it finds in
`order_documents`).

---

### MVP-12 · FORMS — Vendor paperwork filled from the profile via Anvil

**Status:** done — PR #90 (built 1–9: filler seam with mock + Anvil adapter,
`vendor_forms` / `order_documents` migration with placeholder seeds, mapper,
packet builder, checkout hook, webhook + mock sign page, read/act API, order
page Paperwork section, events. Needs from Matthew: ANVIL_API_KEY +
ANVIL_WEBHOOK_SECRET in `.env.local`, real templates uploaded to Anvil with
their eids pasted into `vendor_forms.anvil_template_eid`, the placeholder
field maps / additional-insured wording verified per vendor, and the
FORMS_PROVIDER/FORMS/ANVIL_* vars added to `.env.local.example`.)
**Priority:** high
**Depends on:** MVP-10 (profile data). Coordinate with MVP-11 on the
checkout `after()` block and the order page — one fenced block each.

**Context.** Prop houses make every new customer fill out the same forms:
a rental agreement, a new-account / credit application, sometimes a COI
request with their exact additional-insured wording, sometimes a W-9
request. All of that is data the production already gave us. Anvil
(useanvil.com) fills PDF templates from JSON and runs e-signatures; the
production signs, we never do. Every form we can lawfully complete is
completed at checkout and attached to that vendor's outreach email.

**Anvil facts (verified Sep 2026 against useanvil.com/docs):**
- Node SDK `@anvilco/anvil`; auth is an API key (Basic auth, key as
  username, empty password). Development keys are free, watermark output,
  and rate-limit to ~4 req/s; production keys are 4–40 req/s by plan.
- PDF fill: `POST https://app.useanvil.com/api/v1/fill/{templateEid}.pdf`
  with `{ title?, data: { <fieldAlias>: value, … } }` → PDF bytes
  (`anvil.fillPDF(templateEid, payload)`). Templates are uploaded in the
  Anvil UI and fields are given aliases there; the alias map is per
  template.
- E-sign (Etch): GraphQL `createEtchPacket` with `files` (a template eid
  or an uploaded PDF), `signers` (name, email, `signerType: 'embedded'` for
  in-product signing via `generateEtchSignURL`, or `'email'` to let Anvil
  send), and `data` to pre-fill non-signature fields. Completion arrives by
  webhook (`etchPacketComplete`); finished docs download from
  `GET /api/document-group/{documentGroupEid}.zip`.
- Generate PDF from HTML/Markdown also exists (`generatePDF`) — useful for
  a cover sheet, not needed in v1.

**Current state:**
- No Anvil, no PDF library. Nothing in the repo fills forms.
- Storage: private `paperwork` bucket (`lib/paperwork.ts` for validation
  and bucket name; signed-URL pattern in
  `app/api/projects/[id]/documents/[documentId]/route.ts`).
- Vendor minimums table `vendor_insurance_minimums` (after MVP-9).
- Plans: `lib/plans.ts` has `paperworkGeneration` (free: false, pro: true).
  Gate the FILL behind it with `can(plan, 'paperworkGeneration')`, but in
  the MVP make the free tier `true` with a comment — nobody should hit a
  paywall during validation.

**Build:**
1. Filler interface: `lib/forms/filler.ts` —
   `FormFiller.fillPdf({ templateEid, title, data }) → Buffer`,
   `createSignaturePacket({ templateEid | pdf: Buffer, signer: { name,
   email }, data, orderRef }) → { packetEid, documentGroupEid, signUrl? }`,
   `downloadSigned(documentGroupEid) → Buffer`. `MockFormFiller` (default)
   returns a real, minimal, valid PDF (hand-write the ~600-byte PDF
   skeleton with the title and a "MOCK — filled by Prop Haus" line; no
   library) and fake eids; its `createSignaturePacket` returns a
   `signUrl` pointing at `/orders/[id]/sign/[docId]?mock=1`, a local page
   that just marks the document signed. `AnvilFormFiller` uses
   `@anvilco/anvil` (add the dependency) with `ANVIL_API_KEY`; embedded
   signers so signing happens in-product. `FORMS_PROVIDER=mock|anvil`. Env
   vars + comments in `.env.local.example`, including the webhook secret.
2. Migration: `vendor_forms` (id, vendor_id, kind
   `rental_agreement|credit_application|new_account|coi_request|w9_request|other`,
   label, anvil_template_eid text null, field_map jsonb — `{ <alias>:
   "<profile path>" }` e.g. `{ "companyName": "company.legalName",
   "aiWording": "$vendor.additionalInsuredWording" }`, requires_signature
   boolean, mode `auto|manual`, notes, updated_at). `manual` = we have the
   blank PDF but the vendor needs a wet signature/notary; stored so the
   order page can still hand it over pre-filled where Anvil allows. Seed
   PLACEHOLDER rows for 5–6 vendors (mix of kinds, one `manual`, one
   `coi_request` with an `additionalInsuredWording` note) with
   `anvil_template_eid = null` — the mock ignores it; Matthew fills eids
   after uploading real templates to Anvil.
   `order_documents` (id, org_id, order_id, vendor_id, vendor_form_id,
   kind, label, status
   `filled|awaiting_signature|signed|manual|failed|skipped`, storage_path,
   signed_storage_path, anvil_packet_eid, anvil_document_group_eid,
   sign_url, error, created_at, updated_at). Org-scoped SELECT RLS, writes
   service-role. Also `organizations.order_profile` must NOT gain a tax id;
   if a `credit_application` needs an EIN, the field map points at
   `$signer.ein`, which Anvil collects from the user inside the e-sign
   session (Etch supports signer-filled fields) — say so in the seed
   notes.
3. Mapper: `lib/forms/map.ts` — pure `resolveFieldMap(fieldMap, { profile,
   order, vendor, form }) → { data, missing: string[] }`. Paths resolve
   against the profile (`company.legalName`), `$order.rentalStart`,
   `$vendor.additionalInsuredWording`, `$signer.<x>` (left blank for the
   signer). Formats dates as the form expects (`MM/DD/YYYY` default,
   overridable per alias with `"path|date:YYYY-MM-DD"`), money as digits.
   Vitest against a fixture.
4. Packet builder: `lib/forms/packet.ts` — `buildOrderPaperwork(orderId,
   orgId)`: for each vendor in the order, each `vendor_forms` row with
   `mode = 'auto'` → resolve map → fill → store at
   `orgs/<orgId>/orders/<orderId>/<vendor>/<kind>.pdf` → insert
   `order_documents` as `filled`; if `requires_signature` → also create the
   signature packet (signer = ordering contact from the profile) →
   `awaiting_signature` with `sign_url`. `manual` rows → `manual` status
   with the blank/pre-filled PDF stored. Any resolver `missing` → still fill
   what we can, record the missing labels on the row's `error` so the UI
   can say "2 fields left blank: EIN, fax". Never throws out of the
   function; per-document `failed` rows instead. Refuses to fill when
   `profile.authorization.formsOnBehalf` is false (records `skipped` with
   the reason).
5. Checkout hook: in `after()`, `buildOrderPaperwork(order.id,
   session.orgId)` guarded by `FORMS=off`, placed BEFORE MVP-11's
   `sendOrderOutreach` call (the emails attach whatever `order_documents`
   exist when they go out). Agree on the block order in the route:
   paperwork, then outreach. If MVP-11 lands first, MVP-12 inserts its call
   above it. Filling must be quick for the mock; for Anvil, a slow fill
   delays the email, which is acceptable — a missing attachment is not.
6. Webhook: `POST /api/forms/webhook` — verify Anvil's signature
   (`ANVIL_WEBHOOK_SECRET`), on `etchPacketComplete` download the signed
   group, store as `signed_storage_path`, set `signed`, record
   `document_signed`. Mock path: `/orders/[id]/sign/[docId]` page with a
   single beam button that calls `POST /api/forms/[docId]/mock-sign`
   (only when `FORMS_PROVIDER=mock`).
7. Read/act API (auth, org-scoped): `GET /api/forms?orderId=`,
   `GET /api/forms/[id]/download` (60s signed URL, signed copy when
   present), `POST /api/forms/[id]/refill` (re-run one document after a
   profile fix), `POST /api/orders/[id]/paperwork` (run
   `buildOrderPaperwork` manually for an order that predates this task).
   Matcher: `/api/forms/:path*`.
8. Order page UI: a "Paperwork" section under the vendor requests. Rows per
   §9.7: vendor, form label, StatusToken (`documentStatusSpec`:
   filled→CONFIRMED FILLED, awaiting_signature→QUOTED label SIGN NEEDED,
   signed→CONFIRMED SIGNED, manual→PENDING MANUAL, failed→UNAVAILABLE,
   skipped→PENDING), the blank-field note in 12px mono, and actions:
   "Download", "Sign" (opens `sign_url` — embedded Anvil frame in a route
   `/orders/[id]/sign/[docId]` for the real provider), "Refill". Section
   copy when the org never authorized: "Forms are not filled until you
   authorize it on your order profile." with the link. Fill
   `documentsPending` in `lib/jobs.ts` (awaiting_signature + manual) and
   show it on `/jobs` ("2 to sign").
9. Events: `document_filled`, `document_signed`, `document_failed` in
   `lib/events.ts`.

**Out of scope:** W-9 generation itself (a W-9 is the production's own
IRS form; we only fill a vendor's *request* for one and let the user attach
their W-9 from Paperwork), template authoring UI, vendor-side signing,
per-vendor negotiated terms, storing tax IDs, anything that produces a COI.

---

### MVP-13 · PAPERWORK-CHECKLIST — Project paperwork recommendations from a described production

**Status:** in progress — mhaines/paperwork-checklist (needs from Matthew:
the real template catalog and prices in `lib/templates/catalog.ts`, Anvil
eids for each template once uploaded, and a decision on when
`TEMPLATES_INCLUDED_ON_FREE` flips; `OPENROUTER_API_KEY` turns the mock
intake into the model with no code change)
**Priority:** high
**Depends on:** MVP-10 (org profile feeds template prefill), MVP-12 (vendor
form rows and the filler seam are reused as-is)

**Context.** A user starting a project should be able to describe it in
their own words and get a personalized paperwork checklist: what they need,
why, and the fastest way to close each row (upload their own, use a Prop
Haus template, or request it from the party that issues it). The model
understands the description; deterministic rules decide what is required.

**Shape (built):**
- `lib/project-profile.ts` — the structured Project Profile
  (`projects.profile` jsonb). Tri-state fields: absent means unknown.
  `profileGaps()` is the deterministic list of what to ask next.
- `lib/requirements/library.ts` — the requirements library as data: id,
  category, stage, triggers (a small condition DSL over the profile), level
  (`required | recommended | conditional | informational`), basis
  (`vendor | venue | insurer | client | common | recommended |
  verify_locally`), fulfillment (`upload | template | external | track`),
  who provides it, template id, jurisdiction flag, prerequisites/feeds.
  Never says "legally required".
- `lib/requirements/evaluate.ts` — pure engine: profile + vendor
  requirements + user state + account documents → checklist with the
  trigger's own reason on every row, plus advisories (broker review,
  minors, specialists). `lib/requirements/vendor.ts` turns `vendor_forms`
  and `vendor_insurance_minimums` rows into vendor requirements for the
  vendors on the pull, so "COI, required by Omega" comes from data.
- `lib/intake/` — the intake seam: `MockIntakeExtractor` (keyword
  heuristics, zero secrets) and `OpenRouterIntakeExtractor` (JSON mode,
  same pattern as moodboard.ts). Short yes/no/number answers are routed to
  the last question in code, never by the model. `runIntakeTurn` saves the
  profile, appends the transcript, re-evaluates.
- `lib/templates/catalog.ts` — template library with standard field ids
  and packs; `prefillTemplate()` fills from project + org profile;
  `templateAccess()` is the single/pack purchase seam (included on every
  plan during the MVP).
- Persistence: `20260902200000_project_paperwork.sql` (`projects.profile`,
  `project_intake_messages`, `project_requirements`).
- API: `POST /api/projects` accepts `description` and runs the first turn;
  `POST /api/projects/[id]/intake`; `PATCH /api/projects/[id]/profile`;
  `POST /api/projects/[id]/requirements/[requirementId]` (multipart upload
  or `{ action }`).
- UI: "Start a new project" takes a description; `/projects/[id]/paperwork`
  is the workspace (intake + profile readout on the left, grouped checklist
  with reasons and actions on the right); the project page links to it.

**Out of scope for v1:** template checkout/payment rails, per-vendor
requirement comparison beyond what `vendor_forms` already holds, editing
the profile field-by-field in the UI (the PATCH route exists), document
prefill through real Anvil templates (the mock filler produces the PDF).

---

## Future tasks (not MVP — do not start unless assigned)

### FUT-1 · VENDOR-EXPAND — Book all vendor categories

**Status:** future — the Sep 2026 `/book` scaffold was ROLLED BACK (Sep 2,
2026): `/crew` is the only directory, filtered by role (production
assistants, delivery). Do not reintroduce per-category pages unless assigned.
**Depends on:** MVP-2 (extends its schema)

Expand beyond props and crew to booking every production vendor category:
catering, styling, hair/makeup, equipment, locations support, etc. The
contractor model from MVP-2 generalizes: a `category` on the
contractor/vendor record, per-category browse pages or a unified directory,
same request-to-book flow.

**What survives from the scaffold (reuse when this is picked up):**
- Schema: `contractors.category` (default `'crew'`) is still in place; adding
  a category is seed rows plus config, no schema change.
- Directory + card: `components/crew/crew-directory.tsx` (client, filterable
  list) and `components/crew/contractor-card.tsx`. Role/skill config in
  `lib/crew.ts`. Generalizing these to other categories is the starting point.
- Seed history: `20260901120000_vendor_categories_seed.sql` seeded placeholder
  HMU / styling / lighting-rigging / catering rows;
  `20260902120000_retire_vendor_categories.sql` deactivates and removes them.
  Real vendor data still comes from Matthew.
- Removed: `/book` hub and `/book/*` category routes, `lib/vendor-categories.ts`,
  `components/vendors/`, the "Book" nav link.
- All categories would reuse the MVP-2 request flow (`POST /api/crew/requests`).

**Catering — integration notes (researched Sep 2026):**
Catering is the one category that should outgrow request-to-book into
menu-level ordering. Don't build ordering ourselves; options, best-fit first:
- **ezCater** (ezcater.com) — the dominant B2B/workplace catering
  marketplace, closest product fit. Has public **Menus API** and **Orders
  API** (api.ezcater.io) as of 2025; access is partner-program based, so it
  needs a partnership conversation, not just an API key.
- **MealMe** (mealme.ai) — programmatic food-ordering API over 1M+
  restaurants (search, menus, order placement, delivery via aggregated
  third parties). The closest thing to the "Postmates-style API" — Postmates
  itself no longer has a public ordering API (folded into Uber). Self-serve,
  good for a fast pilot; less catering/head-count native than ezCater.
- **Uber Direct / DoorDash Drive** — white-label delivery-only APIs. No
  catalog/menus; only useful to move food from partner vendors we source
  ourselves.
- **Fallback (previous scaffold):** curated partner vendors in the
  contractors table (`category = 'catering'`) with the request flow. This
  shipped briefly and was rolled back; it may still be the right long-term
  shape for craft services, since set catering is call-sheet-driven, not
  on-demand.

**Still open:** equipment and location-support categories; per-category
request fields (head count for catering, kit fees for HMU); whether other
categories live as more filters on `/crew` or as their own directories.

### FUT-2 · SPACELAB — 3D set preview from cart

**Status:** scaffolded — PR #82 · claude/fut2-space-lab-integration-jwwfs3 ·
phases 1-3 built and demoable with zero secrets; phase 4 needs two things from
Matthew: (a) pick an image-to-3D service (Meshy/Tripo/TRELLIS-class) — the mock
generates real, loadable photo-mapped boxes until then, and swapping it is one
adapter file plus `SPACELAB_MODEL_PROVIDER` + `SPACELAB_ASSET_BUCKET`; (b) the
cross-repo Spacelab change + deployment (remote catalog loading, absolute model
URLs, `?room=` open) — spec'd as a concrete diff in
docs/spacelab-integration.md §0, which is the standing list of what this needs
from Matthew. Until Spacelab is deployed the fallback is real: download the
room file, open it with Spacelab's own "import room".
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

**Built (2026-09-01).** Phases 1-3 in `lib/spacelab/` behind interfaces:
image-to-3D provider (`provider.ts`, mock emits a real GLB via `glb.ts`), model
cache shared across orgs (`models.ts` + `spacelab_models`), Spacelab-format
catalog (`catalog.ts` + `/api/spacelab/catalog`), scene builder verified against
Spacelab's own serde types (`scene.ts`), and the order-page handoff
(`handoff.ts`, `components/ap/spacelab-panel.tsx`, checkout prewarm). See
docs/spacelab-integration.md for the pipeline, the Spacelab-side patch, and what
was deliberately left out (async generator polling, editing back, wall-hung
placement, folder-sourced rooms).

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
production — a real `jobs` grouping entity spanning orders + crew + outreach + paperwork.
Scope with Matthew before starting.

---

### FUT-5 · INBOUND — Vendor replies update the order

**Status:** future
**Depends on:** MVP-11 (outreach messages carry an order-tagged reply-to)

Close the loop on the outreach batch: receive vendor replies (an inbound
route on the mail provider, e.g. Resend/Postmark inbound webhooks to
`orders+<orderId>@<domain>`), thread them onto the `outbound_messages` row,
and let an LLM pass propose per-item status changes (quoted with amount,
confirmed, unavailable) that the user approves with one click — replacing
`pnpm simulate:vendor`. Until then, statuses are set manually via
`PATCH /api/orders/[id]/status`. Scope with Matthew before starting.

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
| MVP-9 | Sonnet | Deletion + renames against an explicit file list. |
| MVP-10 | Sonnet | Schema + one form page + cart trim, fully specced. |
| MVP-11 | Opus for the composer/template + review drawer, Sonnet for the rest | The email copy and the cart review UX are taste work; the send path and API are execution. |
| MVP-12 | Sonnet; Opus only if the Anvil field-map design needs rethinking | Interface + mock + mapper are specced; the Anvil adapter follows their docs. |
| FUT-1/2/3/4 | Opus/Fable to scope, Sonnet to build | Cross-repo architecture (Spacelab) needs the strong model briefly, not for the whole build. |

Token-burn guardrails:
- ONE agent per task, one task at a time per agent. Don't run two agents on
  the same task "for comparison."
- Agents: don't re-survey the repo — the Current state sections above are
  the survey. Read the named files, not the whole tree.
- No multi-agent workflows/ultracode for these — every task here is sized
  for a single agent.
- Cheapest sequencing (Sep 2026 rework): MVP-9 then MVP-10 (both touch
  `/account`), then MVP-11 and MVP-12 in parallel (disjoint files; they
  meet only at the checkout `after()` block and the order page).

---

## Task index

| ID | Title | Status | Priority |
|-------|--------------------------------------|-----------------------------|----------|
| MVP-1 | Finish search (missing data) | in progress — data gap open | high |
| MVP-2 | Contractor hiring page (/crew) | done — PR #62 | high |
| MVP-3 | One-click checkout scaffold | done | high |
| MVP-4 | COI issuance via API partner | RETIRED Sep 2026 (see MVP-9) | — |
| MVP-5 | Site redesign (A done, B in progress)| in progress | high |
| MVP-6 | Backend optimization (competitor API) | BLOCKED — awaiting direct-API access decision; #1 shipped | medium (paused) |
| MVP-7 | Web clipper v1 (paste a link) | in progress — asuncion | medium-high |
| MVP-8 | Jobs-in-progress dashboard | done | medium-high |
| MVP-9 | Retire COI issuance, keep the data | done — PR #88 | high |
| MVP-10 | Order profile (one-click readiness) | done — PR #89 | high |
| MVP-11 | Vendor outreach emails (sent with the click) | done — PR #90 | high |
| MVP-12 | Vendor paperwork via Anvil | done — PR #90 | high |
| FUT-1 | Book all vendor categories | future | — |
| FUT-2 | Spacelab 3D set preview | future | — |
| FUT-3 | Chrome extension web clipper | future | — |
| FUT-4 | Jobs Phase 2 (full dashboard port) | future | — |
| FUT-5 | Inbound vendor replies update orders | future | — |
