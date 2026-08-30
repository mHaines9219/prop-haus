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

# MVP Scope

The MVP is focused on:

1. Inventory aggregation
2. AI-assisted search and discovery
3. Multi-vendor cart workflows
4. Vendor communication automation
5. COI/compliance coordination
6. Consolidated invoicing workflows

The MVP DOES NOT:
- handle physical logistics
- own warehouses
- provide trucking
- issue insurance
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
- Submit a single "project request"
- Receive consolidated proposal/invoice workflows
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

The cart is NOT a direct ecommerce checkout.

It is a:
- sourcing request
- procurement request
- project assembly workflow

---

## 3. Project Request

User submits:
- rental dates
- production details
- contact info
- optional notes/moodboards

The backend then:
- fans out availability requests to vendors
- coordinates vendor responses
- tracks item statuses
- consolidates invoice/proposal information

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

## 5. COI / Compliance Coordination

The platform should help centralize:
- insurance requirements
- COI requests
- vendor compliance requirements
- certificate tracking

IMPORTANT:
The platform DOES NOT issue insurance.

The platform is only:
- workflow software
- compliance coordination
- document automation

The MVP may:
- store vendor COI requirements
- store production insurance info
- generate structured requests
- automate communication with brokers/vendors

The platform should NOT:
- claim to issue insurance
- bind coverage
- act as insurer/broker

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
Potential future layer:
- automated COI workflows
- broker integrations
- embedded insurance coordination

NOT part of MVP.

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
