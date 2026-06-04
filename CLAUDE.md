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
