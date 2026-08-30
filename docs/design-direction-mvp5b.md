# MVP-5b · Design direction — "Turn the projector on"

Direction proposal + implementation punch list. Written by the analysis pass
(Fable); the punch list below is scoped for direct implementation (Sonnet).
DESIGN.md has been amended to v1.1 with the one spec change this direction
requires (section 9.2, marquee cell + fold discipline). Everything else here
is already in the v1.0 spec and simply unbuilt.

---

## Diagnosis: why the design still feels unsatisfying

**1. The site is two products.** Only the home page speaks Answer Print.
Every click — a card, a search, a category — lands in light-mode Astryx.
No amount of direction iteration will read until `/search` and
`/item/[source]/[id]` are migrated (that's Part A, tracked separately).
Part A is the single biggest lever on how the product feels.

**2. The home page is the spec minus its character layer.** The velvet room
shipped; the projector didn't. Comparing `app/page.tsx` + `components/ap/*`
against DESIGN.md v1.0:

| Missing | Spec | Effect of its absence |
|---|---|---|
| Film grain on canvas | §6 | Canvas reads as flat generic dark-mode, not a graded room |
| Camera-report data in the grid | §9.4.3 | Cards show name/subcategory/vendor only — zero mono figures. The "camera report" voice, half the language's character, is absent from the highest-traffic surface. DB already has `price_amount`, `price_unit`, `dimensions`; the card projection just drops them |
| `plate_mode` ingest flag | §4, anti-pattern #14 | Every image renders cutout-mode. Lifestyle/room photos get multiply-blended onto the plate and look washed and broken — a visible quality bug, not a nuance |
| Quick-add on cards | §9.4.2 | Grid is browse-only; no pull-in gesture where users live |
| Status tokens, stamp motion | §9.10, §8 | No workflow surfaces are migrated yet — arrives with Part A |

**3. The front door has no light.** The language's thesis is "inventory
photos are the only luminous thing on screen" — and the hero is eyebrow +
headline + input, entirely non-luminous. On a 1440×900 laptop the first
light well sits below the fold. This is the one place the *language* needed
revision, not just implementation.

**4. The featured grid dead-ends.** Unfiltered browse shows 12 items with no
way to load more (`hasMore` requires an active filter) while the count line
advertises ~90k pieces. The room promises a warehouse and shows a shelf.

---

## Direction (one path)

Keep Answer Print. Do not add hues, radii, serifs, or a new language. Ship
the character layer it already specifies, and make the fold luminous:

**The contact sheet gets a lead frame, and the fold shows it.** The featured
grid opens with a marquee cell — the first cell spans 2×2 in the ruled grid,
same seams, same placard, a photo-mode-preferred item — and the hero's
vertical rhythm tightens so the marquee row crests the fold on a laptop.
Everything else is implementation of the existing spec: grain, mono data in
placards, correct photo-mode rendering, quick-add, working pagination.

This is deliberately not a reinvention. The judged weaknesses of the shipped
page are all "the spec's character didn't get built," plus one real spec gap
(a non-luminous fold), now amended in DESIGN.md v1.1 §9.2.

---

## Implementation punch list (for Sonnet)

Ordered by visual impact per unit of work. Each item is independently
shippable; 1–3 are the core of the direction.

### 1. `plate_mode` flag (fixes the washed-photo bug)
- Migration: `plate_mode text` (`'cutout' | 'photo'`) on the catalog item
  tables + card projection/view. Use current timestamp for the filename.
- Ingest script (`scripts/`): four-corner heuristic verbatim from DESIGN.md
  §4 — sample four 10%×10% corner regions, mean relative luminance ≥ 0.88 →
  `cutout`, else `photo`. Backfill over existing images (batch, resumable);
  new scrapes stamp it at ingest. Use `sharp` for sampling.
- Plumb through: card/browse projections, `CardItem`/`PropItem` types
  (`lib/types.ts` is a shared-file hotspot — keep the diff minimal),
  `LightWell` `mode` prop wired from the item instead of defaulting.
- Until backfill runs, missing flag falls back to `cutout` (current
  behavior) — never guess client-side.

### 2. Camera-report data in the grid
- Extend the browse card projection (`lib/catalog-db.ts`) and `/api/browse`
  with `price_amount`, `price_unit`, and `dimensions`.
- Item card placard line 3 (per §9.4.3): vendor credit left (as today);
  right slot in 13px Spline Sans Mono `text-secondary`, tabular — price
  formatted like `145.00/WK`; fallback key dimension `W 32 IN` (tertiary
  glyphs per §5); fallback empty at fixed height. Slots never change height.

### 3. Marquee cell + fold discipline (DESIGN.md v1.1 §9.2)
- First cell of the featured grid spans 2 columns × 2 rows (`col-span-2
  row-span-2` inside the existing `SeamGrid`; seams unchanged). Placard type
  steps up one size (name 18px Switzer 600). Pick the marquee item
  server-side: first featured item with `plate_mode = 'photo'`, else first
  item. No overlay text on the well, no autoplay rotation.
- Tighten hero vertical padding (`pt-16 md:pt-24` → `pt-10 md:pt-14`,
  `pb-16` → `pb-10`) so the marquee row is visibly cresting at 1440×900.

### 4. Film grain on canvas
- §6 verbatim: 2.5%-opacity monochrome SVG `feTurbulence` tile (256px,
  baseFrequency 0.9), canvas layer only — a `body::before` fixed layer in
  `globals.css` behind content. Never on plates, wells, panels, overlays.
  Never animated.

### 5. Quick-add on cards
- §9.4.2 verbatim: 28px button bottom-right inside the well,
  `rgba(15,15,16,0.85)` fill, hairline border, 2px radius, plus icon.
  `quick-add` motion on hover/focus reveal; always visible on
  `pointer: coarse`. Wire to the existing cart store (`lib/cart-store`).
  It must not navigate (preventDefault inside the card link).

### 6. Unfiltered browse pagination
- Enable the infinite query without an active filter, seeded from
  `initialItems` (drop the `enabled: filterActive` gate; seed page 0 via
  `initialData`). `/api/browse` already supports offset/limit unfiltered.

**Out of scope for this direction:** any new hue, radius, type family, or
layout system; marketing/editorial content blocks; Part A page migrations
(separate task); status-token surfaces (arrive with Part A workflow pages).

**Needs from Matthew:** none to build. React to the shipped result — this
direction claims the dissatisfaction is mostly the unbuilt character layer;
if it still feels wrong with the projector on, the next iteration targets
the language itself with that evidence in hand.
