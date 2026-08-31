# Jobs-in-progress dashboard — implementation plan (MVP-7)

**Source of the concept:** `mHaines9219/dashboard-ui` (the DripDome business
dashboard, npm name `dripdome-dashboard`). This doc contains everything an
implementing agent needs from that repo — do NOT clone or re-survey it.
The prop-haus survey below is also complete — read the named files, not the
whole tree.

**Goal:** give a signed-in user one surface — `/jobs` — that shows every
piece of work they have in flight: orders moving through vendor
confirmation, crew requests, and COIs, with real statuses that change over
time. This is the first slice of the "production workflow platform"
direction in CLAUDE.md, built lean.

---

## 1. What the DripDome dashboard is (source analysis, done 2026-08-31)

Monorepo: Express 4 + Prisma 6/Postgres API, Vite + React 18 SPA web,
TanStack Query v5, Tailwind v4, dnd-kit, Google OAuth + JWT cookie auth,
OpenRouter LLM calls. None of that stack ports — prop-haus is Next 15 App
Router + Supabase. What ports is the **concept and information design**:

- **`Job`** — the central entity: `title, client, description,
  status (inquiry|active|on_hold|completed|archived), startDate, endDate,
  budget, metadata json`, owned by a user.
- **`JobModule`** — a job's dashboard is a composable set of tabs
  (overview/tasks/budget/timeline/vendors/shopping/files/emails/...), each
  a row with a free-form `config` JSON blob. AI infers which tabs a new job
  needs from its description.
- **`Task`** — kanban items per job: `status (todo|in_progress|done),
  priority (low|medium|high|urgent), dueDate, source (manual|email|ai)`.
  Rendered as a 3-column dnd-kit board.
- **Overview module** — the "job in progress" view: a 6-up grid of stat
  tiles (To Do / In Progress / Done / Budget $ / Vendors / Shopping n-of-m),
  a milestone timeline with overdue highlighting, and an LLM summary panel
  (summary + risk flags + suggested next steps).
- **Status badge language** — one color map used everywhere:
  inquiry=yellow, active=emerald, on_hold=orange, completed=blue,
  archived=zinc. (In prop-haus this maps onto the existing `--status-*`
  tokens instead — see §4.)

Notable: the source repo has NO "jobs in progress" list view — just a flat
unfiltered card grid of all jobs. The filtered/derived-progress list is
ours to design, and DESIGN.md §9.7 already specs it (list rows, aggregate
status tokens, "Newel confirmed 4 of 6 items. 2 pending.").

**Explicitly NOT ported:** Express/Prisma/JWT/Google-token storage, Gmail
and Drive sync, OpenRouter agents, notifications table. Phase 1 also skips
JobModule composability and the task kanban — those are Phase 2 (FUT-3).

---

## 2. The prop-haus mapping decision

**A "job" in Phase 1 IS an order, enriched.** Do not create a new `jobs`
table and do not add workflow columns back onto `projects` — projects were
deliberately stripped to plain folders in
`supabase/migrations/20260829130000_strip_workflow_to_folders.sql` (read it
before touching anything project-shaped). The user's in-flight work already
exists as three org-scoped, RLS'd, status-carrying tables:

| Entity | Table | Statuses (CHECK-constrained) |
|---|---|---|
| Order | `orders` + `order_items` | `placed / processing / confirmed / cancelled` |
| Crew request | `crew_requests` | `requested / confirmed / declined` |
| COI | `certificates` | `pending / issued / failed / expired` |

What's missing, and what this task adds:
1. **Per-line-item status** on `order_items` (CLAUDE.md promises "tracks
   item statuses"; nothing implements it).
2. **Status transitions** — today nothing ever moves an order off `placed`
   or a crew request off `requested`.
3. **Any read path for crew requests** — the request is fire-and-forget;
   `GET /api/crew/requests` doesn't exist and no page lists them.
4. **The dashboard surface itself** at `/jobs`.

---

## 3. Data changes

One migration, current-timestamp filename (board rule — avoids collisions
with parallel agents), e.g.
`supabase/migrations/<now>_order_item_status.sql`:

```sql
alter table public.order_items
  add column status text not null default 'pending'
    check (status in ('pending','quoted','confirmed','unavailable')),
  add column status_note text,
  add column quoted_cents integer;
```

- The four values deliberately match DESIGN.md §9.10's canonical
  StatusToken states (PENDING / QUOTED / CONFIRMED / UNAVAILABLE); `quoted`
  carries `quoted_cents` for the "amount in data-strong" rendering.
- No RLS changes needed: `order_items` already inherits the org-scoped
  SELECT policy; writes stay service-role via `createAdminClient()`
  (`lib/supabase/admin.ts`) like every other order write.
- Derive order-level rollup in code, not the DB: an order with all items
  `confirmed` reads as confirmed; any `unavailable` surfaces in the row
  copy; `cancelled` stays a manual order-level state.

Also extend `lib/events.ts` `EVENT_TYPES` with `order_placed`,
`order_status_changed`, `item_status_changed`, `crew_requested`,
`crew_status_changed`, and write them from the checkout route, the crew
request route, and the new transition route. This gives `/jobs` an activity
strip and future surfaces a real feed. (Today nothing logs order or crew
events.)

---

## 4. Design system work (do this first — other pieces consume it)

1. **Extract `StatusToken` to `components/ap/status-token.tsx`.** The
   canonical implementation is currently copy-pasted locally in
   `app/account/insurance/certificate-ledger.tsx`: 6px semantic dot + 11px
   mono 500 uppercase label, transparent bg, 1px hairline border, 2px
   radius, 3px 8px padding. Dots exist ONLY inside tokens, never
   free-floating (DESIGN.md §9.10, §13).
2. **Use the live tokens, not DESIGN.md's hex values.** `app/globals.css`
   is the source of truth (`--status-pending/-quoted/-confirmed/-unavailable`,
   exposed as `bg-status-*` via `@theme inline`, ~line 176). DESIGN.md's
   colors are stale (pre-Nocturne). Any new token needs a value in BOTH the
   dark `:root` block and the `.light` block.
3. **Fix `app/orders/page.tsx`** to use the new StatusToken — it currently
   renders free-floating raw-Tailwind dots (`bg-yellow-400` etc.), which
   violates §9.10/§13. Adopt the extracted component in
   `certificate-ledger.tsx` too (delete the local copy).
4. **Map the four order statuses onto tokens:** placed→pending,
   processing→quoted-ish/pending (pick one and be consistent; recommend
   pending with label PROCESSING), confirmed→confirmed,
   cancelled→unavailable. Crew: requested→pending, confirmed→confirmed,
   declined→unavailable. COI: pending→pending, issued→confirmed,
   failed/expired→unavailable.
5. **Layout language for the dashboard** (DESIGN.md, non-negotiable):
   - §9.7: **list view, never a card grid** — full-width 64px rows, hairline
     seams, radius 0. Left: overlapping mini LightWells of item photos
     (every photo in a LightWell, `components/ap/light-well.tsx`). Right:
     mono count + updated date + aggregate status copy
     ("Newel confirmed 4 of 6 items. 2 pending.").
   - Principle 5: every number/date/status/count is Spline Sans Mono,
     tabular, formatted to the glyph.
   - §9.9 empty state: 11px mono label, one sentence, one action. No
     illustration.
   - §11 copy voice: set-life verbs (pull, hold, strike, wrap), zero
     exclamation points, zero em-dashes in UI copy.
   - Stat tiles (ported from the DripDome overview): a hairline-ruled
     `SeamGrid`-style band of mono figures with 11px uppercase labels —
     restyle, don't copy the source's rounded-card look.

---

## 5. Build list (file by file)

1. **Migration** — §3 above.
2. **`lib/orders.ts`** — add `ItemStatus` type + `status/statusNote/
   quotedCents` on `OrderItem`; `listOrders` already exists; add
   `setOrderStatus(orderId, orgId, status)` and
   `setItemStatus(orderItemId, orgId, status, {note, quotedCents})`
   (service-role, verify the item's order belongs to `orgId`); add a
   `summarizeOrder(order)` helper returning per-vendor confirmed/pending/
   unavailable counts for row copy.
3. **`lib/jobs.ts`** (new) — the aggregation seam. `getJobsOverview(orgId)`
   returns: in-flight orders (status != cancelled, not fully confirmed —
   plus recently completed), each joined with its certificates (match
   existing COI lookup patterns in `lib/coi/`), the org's crew requests,
   and headline stats: orders in flight, items pending/quoted/confirmed,
   crew pending, COIs issued/pending. Server-only, called from the page
   server component (repo pattern: orders are read via server components,
   not GET routes).
4. **`app/api/crew/requests/route.ts`** — add `GET` returning the org's
   requests (401 when signed out, same shape as the existing POST handler's
   session check).
5. **`app/api/orders/[id]/status/route.ts`** (new) — `PATCH` accepting
   `{ status }` or `{ items: [{id, status, note?, quotedCents?}] }`.
   Session-checked, org-scoped, service-role write, logs events. This is
   the seam a future vendor portal or ops tool calls; for now it powers the
   simulator.
6. **`scripts/simulate-vendor-responses.ts`** (new, `pnpm simulate:vendor`)
   — PLACEHOLDER demo driver: walks the latest order's items forward
   (pending→quoted→confirmed, one item unavailable) with small delays so
   the dashboard is demoable end-to-end with zero secrets (board rule:
   never blocked on missing vendor integration). Mark clearly
   `// PLACEHOLDER: replaced by real vendor coordination`.
7. **`components/ap/status-token.tsx`** — §4.1, adopted by
   `certificate-ledger.tsx` and `app/orders/page.tsx`.
8. **`app/jobs/page.tsx`** (new, server component, `requireOrgId('/jobs')`)
   — the dashboard:
   - header (PageShell — use it, don't hand-roll nav/footer like /orders
     does);
   - stat-tile band (§4.5);
   - "In flight" section: order rows per §9.7 linking to `/orders/[id]`;
   - "Crew" section: crew request rows (contractor name, dates, StatusToken);
   - "Certificates" section or fold COI status into each order row's
     aggregate copy (prefer folding; the ledger already exists at
     /account/insurance — link, don't duplicate);
   - recent-activity strip from `events` (optional if time-boxed; the
     event writes in §3 are not optional);
   - empty state per §9.9 pointing at /search.
9. **`app/orders/[id]/page.tsx`** — enrich into the job detail view:
   per-item StatusTokens, group items by vendor with per-vendor rollup
   line, linked certificates, order-level status header. `/jobs` rows link
   here; do NOT build a separate `/jobs/[id]`.
10. **`components/ap/site-nav.tsx`** — add "Jobs" to the `NAV` array
    (merge hotspot — coordinate; keep the diff to the one array entry).
11. **`middleware.ts`** — add `/jobs` to `PROTECTED_PREFIXES` and the
    `matcher`. ALSO add the already-missing session-reading routes
    (`/orders`, `/account`, `/api/checkout`, `/api/crew`, `/api/coi`) —
    the file's own comment warns their tokens currently expire mid-session.
    This is a live bug this task inherits; fix it here.
12. **`.env.local.example`** — no new secrets expected; document any you do
    add.

**Demo path (must work with zero secrets):** sign in → add items → place
order → `/jobs` shows the order pending → run `pnpm simulate:vendor` →
watch rows move to quoted/confirmed with one unavailable → order detail
shows per-vendor rollup → crew request from /crew appears in /jobs.

**Out of scope (Phase 1):** vendor-facing portal/emails, payments, the
composable module system, the task kanban, AI summaries, notifications,
realtime (server components + refresh are fine; no polling).

---

## 6. Phase 2 — FUT-3 (do not build now)

The rest of the DripDome port, scope with Matthew first:
- `job_tasks` kanban (todo/in_progress/done, dnd-kit is NOT currently a
  prop-haus dependency — decide) attached to orders or a real job entity;
- composable module tabs (JSON config per DripDome's `JobModule`) if jobs
  grow past what §5 covers;
- AI overview (summary/risks/next-steps) via the existing Anthropic SDK
  usage in prop-haus, not OpenRouter;
- decision point: introduce a real `jobs` grouping entity (one production
  job spanning multiple orders + crew + COIs) once users have >1 order per
  production. The Phase 1 aggregation seam (`lib/jobs.ts`) is where that
  slots in without UI rework.
