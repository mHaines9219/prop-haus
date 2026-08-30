# CLAUDE.md

# Prop Haus

## Overview

Prop Haus is a production rental aggregation and workflow platform for the entertainment, event, and creative production industries.

The core idea is simple:

- Aggregate inventory from fragmented prop houses and rental vendors into a single searchable interface
- Allow productions to build multi-vendor carts in one place
- Abstract away the operational chaos of sourcing from multiple vendors
- Become the workflow and procurement layer between productions and rental houses

This is NOT intended to be a generic ecommerce marketplace.

The long-term vision is closer to:
- a production procurement operating system
- a workflow + payments + compliance abstraction layer
- eventually, a financial and operational infrastructure platform for production rentals

The MVP is intentionally much smaller and simpler.

---

# Active Workstreams (multi-agent)

Multiple agents work on this repo in parallel. The task board is TASKS.md at
the repo root: every current MVP and future workstream is written there as a
self-contained brief with file paths, deliverables, and boundaries.

If you were asked to "pick up a task" or work on one of the MVP items, read
TASKS.md, claim ONE task by updating its Status line, and follow its brief.
Keep TASKS.md as the single source of truth for task status.

Agents must NEVER stall on missing API keys, credentials, unchosen partners,
or missing data. Build to a plug-and-play state: real integrations behind
interfaces with working mock implementations, env vars documented in
.env.local.example, clearly-marked placeholder data where needed. The full
flow must be demoable with zero secrets. Flag what needs a real key or
decision, then keep building. (Full rules at the top of TASKS.md.)

---

# MVP Scope (updated Aug 2026)

The MVP is focused on:

1. Inventory aggregation
2. AI-assisted search and discovery (search completion is an active task —
   missing catalog data is being resolved)
3. Multi-vendor cart with ONE-CLICK CHECKOUT
4. Crew/contractor hiring (extra hands on set, delivery-type jobs)
5. COI ISSUANCE via a licensed insurance API partner
6. Site redesign (Answer Print migration + design iteration)

The MVP DOES NOT:
- handle physical logistics
- own warehouses
- provide trucking
- underwrite or bind insurance itself (a licensed API partner issues COIs;
  Prop Haus is the workflow and integration layer)
- provide financing
- guarantee payments
- manage returns
- act as a regulated insurer or lender

The goal is to validate:
- productions want a centralized workflow
- vendors are willing to receive requests through the platform
- users value operational abstraction more than direct vendor relationships

---

# Current Product Concept

Users can:

- Browse aggregated prop inventory from multiple vendors in a city
- Search inventory naturally using AI-assisted search
- Build carts from multiple vendors simultaneously
- Check out in ONE CLICK (order details live on the org profile, so checkout
  has nothing to ask)
- Hire crew/contractors for extra hands on set and delivery-type jobs
- Get COIs issued per vendor through an insurance API partner
- Manage production sourcing in one place

The product should feel like:
- procurement software
- production workflow software
- sourcing infrastructure

NOT:
- Amazon
- Shopify storefront
- consumer ecommerce

---

# Current MVP User Flow

## 1. Discovery

Users search:
- "70s apartment"
- "mid-century office"
- "fashion editorial"
- "luxury hotel lobby"
- etc.

AI search and filtering help users discover inventory across all vendors.

Users think in terms of:
- scenes
- aesthetics
- productions
- moods

NOT vendor names.

---

## 2. Unified Cart

Users can add inventory from multiple vendors into one cart.

Example:
- couch from Newel
- lamps from Prop N Spoon
- decor from Eclectic

The cart is a project assembly workflow that ends in a ONE-CLICK checkout —
not a multi-step ecommerce funnel, and not a mere inquiry form.

---

## 3. One-Click Checkout

Checkout is a single action. Everything an order needs lives on the org's
profile ahead of time:
- production/company details
- contact info
- rental date defaults
- (later) payment method and insurance profile

User clicks once → an order is created with all cart items snapshotted.

The backend then:
- records the order and per-vendor line items
- coordinates vendor availability/confirmation (initially manual or
  email-driven)
- triggers COI issuance per vendor (see section 5)
- tracks item statuses

Payment capture is stubbed behind a provider interface in the MVP — the flow
is real, the payment rails come later.

---

## 3b. Crew / Contractor Hiring

Productions can hire extra hands directly in the platform:
- delivery and pickup runs
- load-in / load-out labor
- set dressing assistance
- general on-set help

MVP shape: a curated contractor directory (/crew) with a request-to-hire
flow. NOT a full labor marketplace — no payouts, scheduling, or contractor
self-signup yet. This is the seed of booking ALL vendor categories later
(catering, styling, makeup — see Expansion Opportunities).

---

## 4. Vendor Coordination Layer

The platform automates:
- availability inquiries
- hold requests
- quote coordination
- vendor communication
- invoice aggregation

This can initially be:
- manual
- semi-automated
- email-driven

The MVP does NOT require vendor APIs.

---

## 5. COI Issuance (via insurance API partner)

STRATEGY CHANGE (Aug 2026): COI issuance is IN the MVP. Prop Haus partners
with a licensed insurance API to issue COIs directly in-product — this
replaces the old "coordination-only" stance.

The flow:
- store the production's insurance profile on the org
- store per-vendor COI requirements as data
- evaluate coverage compatibility against each vendor's requirements
- issue COIs per vendor through the partner API (triggered at checkout or
  manually)
- track issued certificates (status, expiry, documents)

Division of responsibility — this matters for legal/copy:
- The PARTNER underwrites, binds, and issues coverage.
- Prop Haus is the workflow, data, and integration layer.
- UI copy must never claim Prop Haus is the insurer or broker.

Until the partner API is selected, the flow is built behind a provider
interface with a mock implementation (see TASKS.md · MVP-4).

---

# Vendor Philosophy

The platform is NOT intended to replace vendors.

The platform should position itself as:
- operational infrastructure
- procurement abstraction
- workflow coordination

The ideal vendor reaction is:
"This sends us cleaner, verified, higher-quality requests."

NOT:
"This marketplace is trying to commoditize us."

The platform should:
- preserve vendor branding
- clearly attribute inventory
- reduce operational friction for vendors

---

# Current Revenue Assumptions

Potential early revenue streams:

## Near-Term
- subscription tiers
- sourcing/concierge fees
- transaction/service fees
- workflow tooling

## Mid-Term
- consolidated billing
- payment processing fees
- vendor SaaS tooling

## Long-Term
- financing / NET terms
- payment guarantees
- embedded insurance coordination
- underwriting/risk systems

The MVP should NOT optimize for monetization complexity yet.

Focus first on:
- workflow value
- operational usefulness
- adoption
- vendor participation

---

# Expansion Opportunities

Potential future directions discussed:

## Production Workflow Platform
- project dashboards
- hold tracking
- approvals
- budgeting
- sourcing history
- continuity tracking

## Vendor SaaS
- inventory systems
- hold management
- analytics
- availability management

## Embedded Payments
- consolidated billing
- payment rails
- ACH/card workflows

## Financing / Factoring
Potential future layer:
- vendors paid quickly
- productions pay later
- Prop Haus absorbs timing gap

NOT part of MVP.

## Insurance Infrastructure
COI issuance via API partner is NOW PART OF THE MVP (see MVP Scope).
Still future:
- broker integrations
- deeper embedded insurance products
- underwriting/risk systems

## Vendor Category Expansion (FUT-1 in TASKS.md)
Book every production vendor category, not just props and crew:
- catering
- styling
- hair/makeup
- equipment
- location support

The MVP crew/contractor model is the seed — its schema should generalize by
category. NOT part of MVP.

## Spacelab 3D Set Preview (FUT-2 in TASKS.md)
Integration with Spacelab (separate repo: mHaines9219/spacelab, local at
/Users/matthewhaines/z_code/spacelab) — a browser-based 3D room studio
(Rust/WASM scene core + React/three.js). After checkout, users can arrange
their ordered items in a 3D room:
- each cart item's photo is converted to a GLB model via an image-to-3D
  service (generated once per catalog item, cached)
- generated models publish to a Spacelab-loadable catalog
- an order becomes a pre-staged Spacelab scene the user opens in one click

Requires cross-repo work in Spacelab (remote catalog loading, deployment).
NOT part of MVP. Full pipeline spec in TASKS.md.

## Logistics Layer
Potential future layer:
- consolidated delivery coordination
- staging
- trucking
- return management

NOT part of MVP.

---

# Product Philosophy

This product should feel:
- premium
- operationally useful
- production-native
- workflow-oriented
- aesthetically curated

NOT:
- generic SaaS
- corporate ERP software
- commodity marketplace

The audience includes:
- set decorators
- production designers
- commercial production companies
- experiential agencies
- event producers
- stylists
- art directors

The UI should feel:
- cinematic
- editorial
- design-forward
- operationally powerful

---

# Technical Philosophy

Current stack:
- Next.js
- TypeScript
- Tailwind
- Zustand
- scraper-based inventory ingestion

Current architecture assumptions:
- vendor inventory aggregation
- normalized catalog structure
- city-by-city expansion
- AI-assisted search
- workflow-first product design

The system should be designed so future vendor integrations/APIs can replace scraping over time.

---

# Key Strategic Insight

The moat is NOT:
- inventory ownership
- hidden vendor relationships
- marketplace exclusivity

The moat is:
- workflow consolidation
- operational abstraction
- compliance coordination
- payments infrastructure
- production trust layer
- vendor trust layer

Prop Haus should become:
"the operating system for production sourcing."

# Design Language: ANSWER PRINT (Aug 2026 redesign)

The UI is migrating to the ANSWER PRINT design language. The full spec lives in
DESIGN.md at the repo root: tokens, color system, the light-well image
treatment, typography, motion patterns, and per-surface component specs. Dark
first, cinematic, balanced neo-brutalist.

- Stack for new and redesigned surfaces: Tailwind v4 (tokens via @theme in
  app/globals.css) + shadcn conventions (components.json, lib/utils cn) +
  KokonutUI registry (npx shadcn add @kokonutui/<name>, always restyled to the
  language, never default) + Motion (import from "motion/react").
- Fonts: Anybody (display, Google), Switzer (body, self-hosted in app/fonts),
  Spline Sans Mono (all data/numbers). Loaded via next/font in app/layout.tsx.
- Answer Print components live in components/ap/. The home page (app/page.tsx)
  is the reference implementation.
- Legacy pages live in app/(legacy)/ and still use Astryx (rules below). Do
  NOT build new surfaces with Astryx. When touching a legacy page, prefer
  migrating it to Answer Print and moving it out of (legacy).
- Every inventory photo renders inside a LightWell
  (components/ap/light-well.tsx), never as a bare image tile. This is the
  signature move of the language; see DESIGN.md section 4.

<!-- ASTRYX:START -->
Astryx v0.1.8 · 153 components
CLI: run every command as `pnpm exec astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing. Full page → AppShell; sidebar nav → SideNav.
- Frame first: pick the shell (AppShell / Layout+LayoutPanel) and budget regions in px BEFORE writing content (`astryx docs layout`).
- Dense data = rows (Table, List/Item) edge-to-edge — never Card-wrapped list items. Card = dashboard widgets, galleries, settings groups only.
- Status → StatusDot/Token; Badge only for counts and enumerated states, never decoration.
- Custom styling: component props first; else Tailwind utilities backed by tokens (bg-surface, text-primary, rounded-lg) via tailwind-theme.css. No raw hex/px.
- Tokens for every value (`astryx docs tokens`). Brand/accent via `astryx theme` — never override --color-* in :root.
- SELF-CHECK before you finish: re-read the file and replace any style={{…}}, raw <div>/<span> layout, imported .css/@apply, or hardcoded/arbitrary value (e.g. bg-[#fff], p-[13px]) with the component or a token-backed utility. If unsure a component/prop exists, run `astryx component <Name>` / `astryx search "<thing>"`; don't hand-roll CSS.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   153 components by category
  template --list    page + block recipes
  docs <topic>       color, elevation, icons, illustrations, internationalization, layout, migration, motion, principles, shape, spacing, styling, theme, tokens, typography
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any @astryxdesign/core bump
<!-- ASTRYX:END -->
