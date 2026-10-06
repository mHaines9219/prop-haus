# Hardening plan — CI, database, cleanup pass (Oct 5 2026)

Scope: make CI a real merge gate, remove the database problems that will bite
on the next deploy or catalog reload, and clean the codebase without adding
layers. Pre-MVP stance throughout: the smallest change that makes the thing
trustworthy; nothing speculative; no queues, no microservices, no rewrites.

Everything below was verified on this machine on Oct 5 2026 unless marked
"(from audit, unverified)". Verification method: a fresh `supabase start`
replay of every migration, the integration project, `pnpm build`, Playwright,
`pnpm db:migrations`, and `supabase db diff --linked` (read-only), plus an
8-dimension code audit whose findings were adversarially re-checked.

## Where things stand

| Layer | State today |
| --- | --- |
| Typecheck, unit, ui tests | Green. 2059 pass, 15 expected-fail, coverage 86/81/86/88 vs 80/70/80/80 thresholds. Needs Node 22 (no pin exists; local default is 25). |
| Lint | Dead. `next lint` crashes on legacy `.eslintrc.json` + ESLint 9 + flat-only eslint-config-next 16. Not in CI. A flat config (drafted at `eslint.config.mjs`) runs and reports 42 errors / 21 warnings. |
| CI integration job | Red on every run since it was created (0 successes). Dies in "Start Supabase". Root causes found and fixed in this worktree: unescaped apostrophe in `20260830120001_crew_seed.sql:49`, and no API-role grants on a fresh stack (new `20260627181000_api_default_privileges.sql`). With both, all 54 files replay and the integration project passes 26/26. |
| Build | Green against the local stack (60 static pages). |
| Playwright | Runs now: 13 pass, 8 fail, 2 skipped. Failures: 5 stale selectors, 2 regex bugs, 1 missing badge, plus 2 real app regressions (unknown category/item URLs return HTTP 200). |
| Migration history | Clean: 53/53 local files have a remote row. |
| Prod schema | Drifted: objects on prod that no migration owns (see PR 3), and a catalog reload path that fails against the migration-defined schema. |
| Production migrate job | Has never executed (it needs the integration job green). Schema has shipped via the manual `pnpm db:push` path. |
| Branch protection | None. PRs #108–#111 merged with red CI. |

## Reproducing CI locally (what worked)

```bash
fnm exec --using 22.14.0 pnpm install --frozen-lockfile
supabase start -x studio,imgproxy,edge-runtime,analytics,vector,realtime
eval "$(supabase status -o env)"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-$ANON_KEY}" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-$SECRET_KEY}" \
  SUPABASE_SECRET_KEY="$SECRET_KEY" SUPABASE_DB_URL="$DB_URL" MAILPIT_URL="$MAILPIT_URL" \
  MAIL_PROVIDER=log FORMS_PROVIDER=mock INTAKE_PROVIDER=mock SPACELAB_MODEL_PROVIDER=mock OPENROUTER_API_KEY= \
  CI=true PORT=3100
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f e2e/seed.sql
# integration: use a scratch vitest config that does NOT merge .env.local (see PR 1 guard)
fnm exec --using 22.14.0 pnpm build && fnm exec --using 22.14.0 pnpm test:e2e
```

Gotchas: `next build`/`next start` load `.env.local` (prod keys) underneath the
shell env, so the explicit exports above are required; port 3000 is usually
another worktree's dev server, and local auth only allows redirects to :3000
(add `http://localhost:3100/**` to `additional_redirect_urls` temporarily);
`pnpm db:migrations` needs `supabase link` once per worktree.

## Sequenced PRs

### PR 1 — CI goes green and becomes the gate (now, ~half day)

Already in this worktree, uncommitted:
- `supabase/migrations/20260830120001_crew_seed.sql:49` — `master's` → `master''s`.
- `supabase/migrations/20260627181000_api_default_privileges.sql` — restores the
  legacy default privileges before the first table is created. The migrations
  use a REVOKE-based model; on a fresh stack there was nothing to revoke and
  even service_role was refused. Additive no-op on prod. Do NOT replace with a
  late `grant ... on all tables`: that would undo every deliberate REVOKE.

Still to do:
1. **e2e fixes** (all xs):
   - Duplicate item-name text (the Party Line card renders the name on the
     plate caption and the headline): `e2e/catalog.anon.spec.ts:9,10,37`,
     `e2e/auth.anon.spec.ts:58` → `getByRole('heading', { name })` or
     `.first()`; `e2e/crew.spec.ts:12` → `{ name: 'Crew', exact: true }`.
   - Project id shape: `e2e/projects.spec.ts:14,38` expect 36-char uuids;
     `lib/projects.ts:257` generates 32-hex → `/[0-9a-f]{32}/`.
   - `e2e/checkout.spec.ts:46` expects "Ready to order" right after Save; the
     badge is server-derived (ledger `order-profile-form.test.tsx:218`). Either
     `page.reload()` in the spec or compute readiness client-side after save.
   - Seed images point at `images.example.com`; the image optimizer logs a
     DNS failure per card. Point `e2e/seed.sql` image URLs at a file under
     `public/e2e/` so pages render offline without noise.
2. **404 regression (app fix, not test fix).** `curl` confirms
   `/category/not-a-category` and `/item/omega/does-not-exist` return HTTP 200
   with a 404 body. Cause: the `loading.tsx` skeletons added in #109 make the
   segment stream, so the shell is sent before `notFound()` runs. Fix:
   `app/category/[slug]/page.tsx` add `export const dynamicParams = false`
   (the slug set is `CATEGORIES`; unknown slugs 404 at the router). For
   `app/item/[source]/[id]`, delete `loading.tsx` and wrap only the related
   strip in `<Suspense>` inside the page so the existence check runs before
   streaming. Trade-off: no instant skeleton on cold item pages; ISR serves
   most of them from cache anyway. Leaving it means junk URLs are cached as
   200 for 86400s.
3. **ci.yml**:
   - Pin `supabase/setup-cli` `version` in both jobs (2.108.0 matches dev
     machines; bump both lines together, by hand).
   - Image pulls: set `SUPABASE_INTERNAL_IMAGE_REGISTRY: ghcr.io` on the
     integration job, `docker login ghcr.io` with `GITHUB_TOKEN`, and wrap
     `supabase start` in a 3-attempt loop. (`ghcr.io/supabase/postgres:17.6.1.139`
     exists; anonymous ECR Public pulls are what rate-limited.) Use valid
     `-x` names: `studio,imgproxy,edge-runtime,analytics,vector,realtime`
     (`logflare` is not a service name).
   - Move `playwright install` above `supabase start` so a browser download
     failure costs seconds, not a stack boot.
   - Split `integration` into `integration` (replay + seed + `test:integration`,
     ~3 min) and `e2e` (replay + seed + build + Playwright). Change `migrate`
     to `needs: [check, integration]`. Trade-off: one extra stack boot per
     run, in exchange for a Playwright flake never again holding production
     schema back while Vercel ships code that expects the new columns.
   - In `migrate`, fail fast with a clear `::error` if either secret is empty.
   - Add `pnpm lint` to `check` once PR 2 lands.
4. **Toolchain pins**: `.nvmrc` = `22`, `"engines": { "node": "22.x" }`,
   `node-version-file: .nvmrc` in CI; `git rm package-lock.json` (stale since
   PR #8; lists removed Astryx packages); commit `pnpm-workspace.yaml` with
   `ignoredBuiltDependencies: [esbuild, sharp, unrs-resolver]` and drop the
   `.gitignore` block that hides it.
5. **Integration safety guard** (xs): `vitest.config.ts:105` merges
   `.env.local` into the integration project, and those tests create and
   delete auth users and organizations. Add `test/setup-integration.ts` that
   throws unless `NEXT_PUBLIC_SUPABASE_URL` is localhost/127.0.0.1 or
   `ALLOW_HOSTED_INTEGRATION=1`. Fix the canary's message
   (`lib/eval/integration-canary.test.ts:30,52`): `pnpm test` →
   `pnpm test:integration`.
6. **Branch protection** (Matthew, 1 min): require `check` and `integration`
   on `main`, PRs only. `gh api -X PUT repos/mHaines9219/prop-haus/branches/main/protection`
   with `required_status_checks.contexts = ["Typecheck, unit and component tests", "Integration and end-to-end"]`.

Done when: a PR run is green end to end; the next merge to main executes the
`migrate` job and it records `20260627181000` on prod.

### PR 2 — Lint back online (now, ~2 h)

- Delete `.eslintrc.json`; keep the drafted `eslint.config.mjs`
  (eslint-config-next 16.3.8 is flat-only with peers eslint>=9 and typescript
  only; it works on Next 15 — verified). `"lint": "eslint ."`, add `lint:fix`.
- Fix the 63 findings: 22 `no-explicit-any`, 12 `no-unused-vars`,
  7 `@next/next/no-location-assign-relative-destination` (the six
  `window.location.href = '/login…'` 401 redirects; a 5-line
  `redirectToLogin(next)` in `lib/safe-redirect.ts` fixes these and ledger
  entries `cart/page.test.tsx:416`, `search/page.test.tsx:300`),
  1 `react-hooks/purity` (`browse-grid.tsx:56`, delete the file, see PR 5),
  1 each immutability/refs/no-this-alias/prefer-const/anonymous default export.
  Set the 15 `react-hooks/set-state-in-effect` to `warn` for now and fix
  opportunistically; they are real but not MVP-blocking.
- `tsconfig.json`: `"noUnusedParameters": true` (0 new errors, verified).
- Then `pnpm lint --max-warnings 0` in the `check` job.

### PR 3 — Database: capture the drift, fix the reload path (now, ~half day)

Evidence: `node --env-file=.env.local scripts/supabase-linked.mjs db diff --linked`
(read-only) lists what prod has that migrations do not:
- `public.prop_items` view — the relation `lib/catalog-db.ts` reads. Created
  by hand after PR #70 switched the code from `catalog_items` (the
  migration-owned view) to `prop_items` on the mistaken belief that
  `catalog_items` did not exist. It also exposes `embedding` and `search_tsv`,
  which `catalog_items` deliberately hides. CI only passes because
  `e2e/seed.sql:9-14` recreates it.
- `catalog.prop_items.has_images` stored column + `prop_items_has_images()`
  trigger + `prop_items_has_images_col_idx` (migrations compute `has_images`
  in the view and index the expression).
- `prop_items_cat_id_with_images_idx` on `(category, id) where images exist` —
  useful (browse orders by id within a category); migrations lack it.
- `prop_items_keyword_idx` GIN over `catalog.prop_item_document()`,
  `catalog.keyword_tsquery()`, `public.search_catalog_keyword()` — from
  unmerged PR #31; the app never calls them (only
  `scripts/eval-keyword-ranking.ts`). A GIN expression index over 90k rows
  slows every reload for nothing.
- A different `public.rls_auto_enable()` body. (`DROP EXTENSION pg_net` in
  the diff is local-stack noise.)

Steps:
1. Code: `lib/catalog-db.ts` lines 171, 221, 237, 270, 295 `.from("prop_items")`
   → `.from("catalog_items")` (the view already carries `plate_mode` and
   `has_images`); update `lib/catalog-db.test.ts`; delete the shim in
   `e2e/seed.sql:9-14`.
2. One migration `prune_prod_drift`: drop `public.prop_items`,
   `public.search_catalog_keyword`, `catalog.prop_items_keyword_idx`,
   `catalog.keyword_tsquery`, `catalog.prop_item_document`, the `has_images`
   trigger/function/index/column; `create index if not exists
   prop_items_cat_id_with_images_idx …`; re-assert `rls_auto_enable()` from
   `20260627181209`. All `if exists`, so it replays on a fresh stack.
   Trade-off: dropping is the MVP-right call; keeping would mean writing
   migrations for objects nobody uses.
3. Reload path (verified broken locally): `truncate catalog.prop_items` alone
   now errors because `prop_item_keywords.id` references it. The current
   `catalog.swap_in_staging()` (rewritten in `20260830150000_plate_mode.sql:33`)
   truncates only `prop_items`, drops the price columns from the copy, and
   no longer refreshes facets; `scripts/load-catalog.ts:129` has the same
   single-table truncate and never refreshes facets; `catalog.refresh_facets()`
   is not `security definer`, so `service_role` and `catalog_writer` get
   "must be owner of materialized view". One migration: redefine
   `swap_in_staging` with `truncate catalog.prop_items,
   catalog.prop_item_keywords`, price columns + `plate_mode`, and `perform
   catalog.refresh_facets()`; make `refresh_facets` `security definer set
   search_path = ''`. Fix the loader to truncate both tables (or call the
   function) and refresh facets. This is what the MVP-1 data drop will hit
   first.
4. `crew_requests`: the only client-side INSERT in the schema; its with-check
   covers `org_id` only, so a signed-in user can POST `status='confirmed'` or
   another org's `project_id` straight to PostgREST. Switch
   `app/api/crew/requests/route.ts` to `createAdminClient()`, `revoke insert …
   from authenticated`, drop the policy — the pattern every other write table
   uses.
5. Done when: after the `migrate` job runs, `db diff --linked` prints an empty
   diff. Add that command as a non-blocking step at the end of `migrate` so
   drift is visible on every merge (needs Docker on the runner; it is there).

Later, not now: neutralise the eight `measure_*` migrations (replace bodies
with a comment, drop `catalog.measurements` and `measurement_summary`); move
the six placeholder contractors from `20260830120001` into `e2e/seed.sql`
(the e2e suite asserts on their names); stop putting `begin;`/`commit;` inside
migration files (the CLI already wraps each file).

### PR 4 — Checkout reliability, the product promise (now/soon, ~half day)

All verified by reading; none needs a queue.
- `app/api/checkout/route.ts:101`: paperwork and outreach are separate
  `after()` callbacks and Next runs them concurrently, so the email usually
  ships before the forms exist. Merge into one callback: paperwork, then
  outreach. Leave Spacelab in its own `after()`.
- Idempotency replay (`lib/orders.ts:96`) returns the existing order and the
  route still records events and re-runs every hook, so a retried click
  re-emails every vendor. Return `{ order, created }`; when `!created`,
  respond 200 and skip events + hooks.
- `lib/orders.ts:116`: an `order_items` failure leaves an empty order pinned
  to the idempotency key; delete the orphan before rethrowing.
- `lib/outreach/send.ts:97`: a failure before the first `outbound_messages`
  insert is unrecoverable (retry only accepts `failed`). Make
  `sendOrderOutreach` skip vendors that already have a `sent` row and add
  `POST /api/orders/[id]/outreach` (org-scoped) to re-run it.
- `lib/order-profile-store.ts:22`: `getOrderProfile` returns the empty
  profile on a read error, and `storeCoiDocument` then writes it back, wiping
  legal name, contacts, addresses and authorization. Throw on `error`; flip
  the `it.fails` at `order-profile-store.test.ts:182`.
- Production guard: `MAIL_PROVIDER` unset means log-only and the order page
  says SENT; `FORMS_PROVIDER` unset means the mock sign route stores a stub
  as the signed copy. Throw at startup when `VERCEL_ENV === 'production'`
  and either is unset (an explicit `log`/`mock` still opts in).
- Tests: `lib/forms/packet.ts` is at 6% line coverage and is mocked out of
  the checkout route test; add `lib/forms/packet.test.ts` and
  `lib/outreach/send.test.ts` through the mock filler and log mailer, and one
  assertion in `e2e/checkout.spec.ts` that the order page shows the outreach
  rows after the click.

### PR 5 — Hygiene: ledger, dead code, docs (soon, ~half day, mechanical)

- Flip the remaining `it.fails` ledger (each xs): order status PATCH
  validates before writing (`orders/[id]/status/route.ts:62`); crew request
  zod schema (`crew/requests/route.ts:50`); contractor-card date split on
  `[,;\n]` only (`contractor-card.tsx:53` currently splits on whitespace, so
  "Sep 12, Sep 15" is stored as fragments); `Object.hasOwn` for the
  outbound-click source check (`route.ts:33`); record `project_created`
  (`api/projects/route.ts:63`); accessible labels on the order-profile form
  (also lets e2e stop using `.nth()` on three identical address blocks).
- `middleware.ts:83` matcher is missing `/crew`, `/api/events/outbound-click`,
  `/api/spacelab/scenes`; add them and un-fail `middleware.test.ts:148`.
- Small guards: `lib/spacelab/handoff.ts:124` `SPACELAB_PREWARM` default
  `off` (FUT-2 should not run on every MVP order); `export const revalidate =
  3600` on `app/page.tsx` and `app/category/[slug]/page.tsx` (counts only
  change on redeploy today); cap vision buckets in
  `lib/search-modes.ts:116` (8 items + 4 additions); replace the raw
  provider error in `app/api/search/route.ts:157` with a fixed message; rate
  limit + `name.slice(0,120)` on `crew/roster-applications/route.ts`;
  allowance check in `lib/intake/turn.ts` so AI intake is metered like search.
- Delete: `components/ap/browse-grid.tsx` + test (no importer since Nocturne);
  `lib/catalog.ts` `getByCategory/getItem/categoryCounts` + their tests;
  `FOLDER_KINDS` (`lib/projects.ts:47`), `EMPTY_PROJECT_PROFILE`
  (`lib/project-profile.ts:59`); `app/fonts/Switzer-Variable.woff2` (no
  references); `@anthropic-ai/sdk` and `openai` from `package.json` (zero
  imports; two dead `vi.mock` lines in `lib/search-modes.test.ts:13-14`);
  `lib/payments/*` and `checkout/route.ts:115-122` (`total_cents` is never
  written, so the provider is unreachable); the nine stub scrapers (move each
  blocker note into `lib/vendors.ts` `notes`).
- Duplication worth collapsing (and only these; the rest is deliberate):
  `lib/catalog-db.ts:38` accept `PUBLISHABLE_KEY ?? ANON_KEY` like the auth
  clients, plus the three scripts that accept only `ANON_KEY`; the unguarded
  `req.json()` in `checkout`, `checkout/preview`, `projects/[id]/archive`
  (500 on bad body; archive parses before the 401 check); fake-supabase
  defaulting `project_items.added_at` so three route tests drop their inline
  admin mocks. Opportunistic, when touching the files: one `formatDate` in
  `lib/utils.ts` (seven copies), one board-status-select component
  (`job-status-select` and `project-status-select` are rename-only copies),
  use `components/ui/input.tsx` in the three forms that hand-roll the class.
- Docs/board: `TASKS.md:13` and eight briefs say Answer Print → Party Line;
  Status lines for MVP-5, MVP-7, MVP-13 are stale (all merged); D1 names
  `catalog.catalog_items` (table is `catalog.prop_items`); K1 omits
  `sendgrid`; delete `docs/design-direction-mvp5b.md`; mark
  `docs/jobs-dashboard-plan.md` historical; `docs/testing.md` says two CI
  jobs and old key names; `enrich`, `embed`, `db:load` scripts lack
  `--env-file=.env.local` unlike their siblings; `.mcp.json` add
  `&read_only=true` (it hands every agent session a write-capable MCP on
  prod); `supabase/config.toml:71` seed path → `../e2e/seed.sql`.

### Decision for Matthew: search on the deploy

`app/api/keyword/route.ts:17` and `lib/search-index.ts:35-39` read
`data/catalog.json` and `data/embeddings.f32`, which are gitignored and exist
on no deploy or CI machine. Search therefore returns zero results anywhere but
a laptop that ran `db:dump`. TASKS.md (MVP-1) parks the pipeline rework until
the data drop, but the database already has the halfvec + HNSW index and the
backfilled `prop_item_keywords` side table. Moving the two routes to SQL (two
functions in `public`, ~m effort) makes search work on the deploy; it is
blocked only by that note. Recommendation: do it as the first MVP-1 item
rather than after the data drop, because a search that only works locally
cannot be demoed. Until then, add `e2e/search.anon.spec.ts` that fails
honestly.

### Explicitly deferred (not before MVP)

Next 16 upgrade (repo already satisfies its hard breaks; do it as one codemod
PR after CI is green); any job/queue system for `after()`; keyset pagination;
per-user cart keys; Dependabot (after branch protection); `remotePatterns`
host allowlist (needs the host list from the DB; the `**` wildcard is a cost
risk, not a data risk); `exactOptionalPropertyTypes` (110 errors, no payoff).
