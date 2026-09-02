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

# MVP Scope (reworked Sep 2026)

STRATEGY CHANGE (Sep 2026): COI issuance is OUT of the MVP. The insurance
API partnership did not work out, and Prop Haus will NOT white-label,
issue, bind, or broker certificates of insurance. Productions bring their
own coverage; Prop Haus moves the paperwork and the requests.

The MVP is focused on:

1. Inventory aggregation
2. AI-assisted search and discovery (search completion is an active task —
   missing catalog data is being resolved)
3. Multi-vendor cart with a TRUE ONE-CLICK CHECKOUT — the click places the
   order AND does everything a coordinator would do next
4. Vendor outreach automation: per-vendor emails pre-written from the order
   and the org profile, batched, and sent — reviewable, never required
5. Paperwork automation via Anvil: every vendor form we can lawfully
   complete on the production's behalf is filled from the org profile; the
   user only signs
6. Crew/contractor hiring (extra hands on set, delivery-type jobs)
7. Site redesign (Answer Print migration + design iteration)

The MVP DOES NOT:
- handle physical logistics
- own warehouses
- provide trucking
- issue, bind, underwrite, broker, or white-label insurance or COIs (the
  production's own broker issues certificates; Prop Haus stores the COI on
  file, attaches it, and fills the vendor's COI *request* form)
- provide financing
- guarantee payments
- manage returns
- act as a regulated insurer or lender
- sign anything for the user (signatures are always the user's own, via
  Anvil e-sign)

The goal is to validate:
- productions want a centralized workflow
- vendors are willing to receive requests through the platform
- users value operational abstraction more than direct vendor relationships
- "one click and the emails and forms are handled" is the thing people pay for

---

# Current Product Concept

Users can:

- Browse aggregated prop inventory from multiple vendors in a city
- Search inventory naturally using AI-assisted search
- Build carts from multiple vendors simultaneously
- Check out in ONE CLICK (order details live on the org profile, so checkout
  has nothing to ask)
- Have the per-vendor request emails written, batched, and sent for them —
  and open any of them to review, edit, hold, or send now
- Have vendor paperwork (rental agreements, account applications, COI
  requests) filled from their profile through Anvil, and sign in-product
- Hire crew/contractors for extra hands on set and delivery-type jobs
- Manage production sourcing in one place

The product should feel like:
- procurement software
- production workflow software
- sourcing infrastructure
- a coordinator who already sent the emails

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
ORDER PROFILE ahead of time (see TASKS.md · MVP-10):
- production/company details (legal name, DBA, entity, addresses)
- contact info (ordering contact, accounts payable)
- rental date defaults and default delivery address
- insurance on file: the production's OWN COI (uploaded PDF), carrier,
  policy limits, expiry, and broker contact
- a recorded authorization for Prop Haus to complete vendor forms with this
  information on the org's behalf
- (later) payment method

If the profile is incomplete, the cart says exactly what is missing and
links to the profile. It never grows a checkout form of its own.

User clicks once → an order is created with all cart items snapshotted.

The backend then, without further input:
- records the order and per-vendor line items
- writes one outreach email per vendor and queues the batch (section 3c)
- fills every vendor form we have a template for and stages anything that
  needs the user's signature (section 5)
- tracks item statuses as vendors respond

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

## 3c. Vendor Outreach (pre-written, batched, sent)

The email a coordinator would write after placing an order is written by the
platform instead (TASKS.md · MVP-11):
- one message per vendor in the order: the items (with links and photos),
  rental window, production name, contact, delivery address, and the
  production's COI attached when it is on file
- the whole batch is queued at checkout and sent together after a short
  review window (configurable; "Send now" skips it)
- the user CAN review: the order page lists every message with its status;
  each opens to a preview where the user may edit, hold, or send now
- the user never HAS to review: an untouched batch goes out on schedule

Sending is behind a mail-provider interface with a logging mock, so the
flow demos with zero secrets. Vendor replies come back to the production's
contact email with an order-tagged reply-to; status updates on the order
are still recorded manually or by the simulation script in the MVP.

---

## 4. Vendor Coordination Layer

The platform automates:
- availability inquiries and hold requests (the outreach batch)
- quote coordination
- vendor onboarding paperwork (the Anvil packet)
- invoice aggregation

Beyond the outreach batch and the paperwork packet, coordination can
initially be:
- manual
- semi-automated
- email-driven

The MVP does NOT require vendor APIs.

---

## 5. Paperwork Automation via Anvil (no insurance issuance)

STRATEGY CHANGE (Sep 2026): COI issuance via an insurance API partner is
DROPPED. What replaces it is paperwork automation (TASKS.md · MVP-12):

- store the production's "paperwork profile" on the org (company, contacts,
  addresses, tax details where a form needs them, insurance on file)
- store per-vendor form requirements as data: which forms a vendor needs
  (rental agreement, new-account / credit application, COI request, W-9
  request), the Anvil PDF template for each, and a field map
- at checkout (or manually from the order page), fill each form through the
  Anvil PDF fill API with the profile data, store the PDF with the order, and
  attach it to that vendor's outreach email
- forms that need the user's signature become an Anvil Etch e-sign packet
  with the USER as the signer; the order page shows "Sign" and the signed
  copy is stored when Anvil calls back
- evaluate the production's COI on file against each vendor's stated
  minimums and surface gaps as a warning in the outreach preview (never a
  blocker, never an offer to fix it for them)

Legal guardrails — these matter for code and copy:
- Prop Haus fills DATA fields the user has supplied and authorized. It never
  applies a signature, initial, or date-of-signature on anyone's behalf.
- Prop Haus never produces a certificate of insurance. An ACORD 25 comes
  from the production's broker; we may fill the vendor's COI REQUEST form
  and forward it to the broker.
- Forms needing a wet signature or notarization are marked `manual` and
  handed to the user with the data pre-filled where Anvil allows it.
- UI copy must never say Prop Haus is an insurer, broker, or agent. It says
  "filled from your profile" and "you sign".

Until an Anvil key is present, the flow is built behind a form-filler
interface with a mock implementation that produces stub PDFs.

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
- insurance coordination (workflow only; never issuance)
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
COI issuance via an API partner was tried in Aug 2026 and DROPPED in Sep
2026: Prop Haus will not white-label, issue, or broker certificates. What
the MVP keeps is the workflow side only: the production's own COI on file,
vendor minimums as data, COI request forms filled and forwarded to the
production's broker (see MVP Scope §5).
Still future, and only ever as coordination, never as the insurer:
- broker integrations (request/receive certificates programmatically)
- expiry tracking and renewal reminders
- underwriting/risk data products for partners

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

ALL UI uses the ANSWER PRINT design language. The full spec lives in
DESIGN.md at the repo root: tokens, color system, the light-well image
treatment, typography, motion patterns, and per-surface component specs. Dark
first, cinematic, balanced neo-brutalist.

- Stack: Tailwind v4 (tokens via @theme in app/globals.css) + shadcn
  conventions (components.json, lib/utils cn) + KokonutUI registry
  (npx shadcn add @kokonutui/<name>, always restyled to the language, never
  default) + Motion (import from "motion/react").
- Fonts: Anybody (display, Google), Switzer (body, self-hosted in app/fonts),
  Spline Sans Mono (all data/numbers). Loaded via next/font in app/layout.tsx.
- Answer Print components live in components/ap/. The home page (app/page.tsx)
  is the reference implementation.
- Every inventory photo renders inside a LightWell
  (components/ap/light-well.tsx), never as a bare image tile. This is the
  signature move of the language; see DESIGN.md section 4.
- Theming: dark is the default. next-themes (wired in app/providers.tsx)
  toggles a `.light` class on <html>; light token overrides live in
  app/globals.css next to the dark :root block. Any new color token needs a
  value in BOTH blocks. The toggle lives in components/ap/site-nav.tsx.
- Astryx (the previous design system) was FULLY REMOVED in Aug 2026 — no
  @astryxdesign dependencies, no `astryx` CLI, no app/(legacy)/. Never
  reintroduce it; ignore stale references in old docs or git history.

