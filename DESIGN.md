# ANSWER PRINT

**The screening room at night: the UI is the room, the props are the picture.**

Version 1.1 (Aug 2026: §9.2 amended — marquee cell and fold discipline; see docs/design-direction-mvp5b.md for the rationale). Ready to implement. Dark-first, cinematic, balanced neo-brutalist. This is the winning candidate from the design review (highest total, 23.5, ranked first by the audience and usability lenses), refined to resolve every judge-flagged weakness and hardened with the strongest grafts from the other three candidates. See the decision record at the end of this document.

---

## 1. Concept

Answer Print is named for the final color-timed print a DP approves in the screening room, and the whole product behaves like that room at night. The canvas is velvet, slightly cool near-black, calibrated like a grading suite wall. The only luminous objects on screen are the inventory photos, which sit in dimmed neutral light wells like footage on a reference monitor.

Light follows projector logic. Attention equals brightness: wells rest slightly dimmed, hover lifts the dim and beams the plate up, focus lights the frame, entrances are light coming up, never objects flying in. The single tally-red accent behaves like the record light on a camera: it means signal (live, stop, destructive, focused), and it never means "go." The primary action in this system is always light itself, a bright beam button, so red is unambiguous everywhere it appears.

Beneath the quiet surface the structure is rigidly brutalist: ruled contact-sheet grids with exposed hairline seams, expanded title-card display type, and monospaced camera-report data. The UI is the room; the props are the picture.

The product speaks the audience's own language. Saved collections are Pulls, because "pull" is the set decorator's word. Vendors are credited like lenders to an exhibition, not stamped like SKUs.

---

## 2. Design Principles

1. **The inventory is the footage.** The UI recedes into velvet black; photography is the only luminous thing on screen. Nothing in the chrome may out-shine a light well.
2. **Calibrated, not decorated.** One cool-neutral gray family, one desaturated tally-red accent in two documented tiers, flat surfaces, hairline structure. Nothing exists without an operational reason.
3. **Light behaves like a projector.** Brightness is the attention system. Wells are dimmed at rest and light up under attention. Entrances are light coming up. Nothing flies, floats, or levitates.
4. **Red never means go.** The primary CTA is a light-filled beam button. Tally red is reserved for signal: focus, live counts, stop states, destructive moments.
5. **Data reads like a camera report.** Every dimension, count, price, date, and status is monospaced, tabular, terse, and formatted to the glyph.
6. **Structure is honest.** Ruled edge-to-edge grids with visible seams, list rows instead of floating cards, zero soft shadows on in-flow surfaces. Borders never disappear on hover; hover changes fill, never structure.
7. **Premium is spacing and restraint.** Generous padding, sentence-case copy, and spring-polished motion soften the rigid skeleton.

---

## 3. Color System

One gray family (cool-neutral, hue ~240, saturation under 5%). One accent hue (tally red, hue ~6, saturation 61 to 64%, well under the 80% cap) in two tiers: a fill tier and an AA-safe text tier. No other hues except the two functional workflow status colors. Never pure #000000, never pure #FFFFFF as a surface.

All contrast ratios below are computed WCAG values, verified by arithmetic.

| Token | Hex | Role | Contrast notes (verified) |
|---|---|---|---|
| `canvas` | `#0F0F10` | Page background, velvet black, slightly cool. Also the ink color on light plates and beam buttons. | Base surface |
| `surface-raised` | `#161618` | Nav chrome, sidebars, drawers, panels | primary 15.46:1, secondary 7.56:1 |
| `surface-inset` | `#1C1C1F` | Inputs, skeleton shapes, undecoded image wells, row hover on raised surfaces | primary 14.54:1, secondary 7.11:1, tertiary 5.23:1 |
| `surface-overlay` | `#232327` | Menus, popovers, active and pressed rows | primary 13.39:1, secondary 6.55:1, tertiary 4.82:1 |
| `border-hairline` | `#26262A` | All structural rules: grid seams, dividers, card frames, table lines | Structural, non-text |
| `border-strong` | `#3A3A40` | Input borders, hovered frames, overlay outlines | Structural, non-text |
| `plate` | `#E9E9EB` | Image well plate, the reference monitor at 92 percent. White-background photos multiply into it seamlessly. | Ink `#0F0F10` on plate: 15.80:1 |
| `plate-lit` | `#F4F4F6` | Beamed-up plate state (hover, item-detail hero). Also the beam button hover fill. | Ink on plate-lit: 17.44:1 |
| `text-primary` | `#EDEDEF` | Headings, item names, primary copy. Also the beam (primary) button fill. | 16.39:1 on canvas |
| `text-secondary` | `#A7A7AE` | Body copy, metadata values, status token labels | 8.01:1 canvas, 7.11:1 inset, 6.55:1 overlay, 7.17:1 on tally-wash |
| `text-tertiary` | `#8E8E97` | Placeholders, captions, deemphasized labels, the "x" in dimension strings | 5.90:1 canvas, 5.23:1 inset, 4.82:1 overlay. AA with margin on every surface it may sit on. |
| `tally` | `#D25446` | THE accent, fill tier: focus rings, cart count badge fill, destructive fills, unavailable dot, selected states. HSL(6, 61%, 55%). | Non-text vs canvas 4.65:1, vs raised 4.39:1, vs inset 4.13:1, vs overlay 3.80:1 (all clear the 3:1 non-text minimum). Canvas ink `#0F0F10` on a tally fill: 4.65:1, AA for the 11px badge text. Permitted as text only at 13px+ on canvas (4.65:1). |
| `tally-text` | `#E08573` | The accent, text tier: all small red text, links in red contexts, error copy, UNAVAILABLE labels, inline field errors. Same hue family, lifted. | 7.09:1 canvas, 6.69:1 raised, 6.29:1 inset, 5.79:1 overlay, 6.34:1 on tally-wash |
| `tally-wash` | `#2A1617` | Background wash for unavailable rows and destructive confirms. Never large fields. | secondary on wash 7.17:1, tally-text on wash 6.34:1 |
| `status-pending` | `#8E8E96` | Workflow dot: request sent, awaiting vendor (house lights). Dot only, never text. | Dot vs canvas 5.89:1 |
| `status-quoted` | `#E3B341` | Workflow dot: vendor quoted, needs decision (standby amber). Dot only, never text. | Dot vs canvas 9.84:1 |
| `status-confirmed` | `#58A87C` | Workflow dot: hold confirmed (green means go). Dot only, never text. | Dot vs canvas 6.67:1 |
| `status-unavailable` | `#D25446` | Workflow dot: unavailable or declined. Deliberately the tally hex, because red means stop everywhere in this system. Label text uses `tally-text`. | Dot 4.65:1, label 7.09:1 |
| `scrim` | `#08080A` | Overlay backdrop behind drawers and dialogs, at 60% opacity | Non-text |

**Color rules**

- Text tiers: primary for names and headings, secondary for reading copy and data values, tertiary for captions and placeholders. Disabled text may use `#5A5A62` and is intentionally below AA; it never carries information a user must read.
- Status hues appear only inside status token dots. Labels stay `text-secondary`, except UNAVAILABLE, which uses `tally-text`.
- Red is never a primary CTA. The beam button (light fill, dark ink) is the only primary action treatment.
- No gradients anywhere on surfaces. The only gradient in the product is none; even the plate is flat.

---

## 4. The Light Well (Image Treatment)

The signature move and the answer to the scraped-white-photo constraint. Every inventory photo, everywhere in the product (card, hero, thumbnail, cart row, pull preview), renders inside a **light well**: a fixed-aspect frame whose background is always the `plate` token, never the photo's own background. White scrape backgrounds fuse invisibly into the plate via multiply blending. Wells are dimmed at rest by a canvas-tinted scrim and light up under attention, so a browse grid reads as a wall of quietly glowing monitors, not a strobing checkerboard.

### Ingest heuristic (stored, never guessed at render)

At ingest, sample the four corner regions of each image (each region is 10% by 10% of image dimensions) and compute mean relative luminance:

- Mean corner luminance **at or above 0.88**: store `plate_mode = "cutout"`.
- Below 0.88 (lifestyle shots, real rooms, colored backdrops): store `plate_mode = "photo"`.

The flag lives on the item record. The well component reads it and never runs detection client-side.

### Layer recipe (bottom to top)

```css
.well {
  position: relative;
  aspect-ratio: 4 / 5;
  border: 1px solid var(--border);          /* #26262A hairline frame */
  border-radius: 2px;
  background: var(--surface-inset);          /* #1C1C1F until the image decodes */
  isolation: isolate;
  overflow: hidden;
}

/* Everything below is inside .well__stack, which fades in as one unit
   over 320ms cubic-bezier(0.22, 1, 0.36, 1) after img.decode() resolves.
   A white frame must never flash. */

.well__plate { position: absolute; inset: 0; background: var(--plate); }        /* #E9E9EB */

.well__lit   { position: absolute; inset: 0; background: var(--plate-lit);      /* #F4F4F6 */
               opacity: 0; transition: opacity 180ms cubic-bezier(0.33,1,0.68,1); }

.well__img   { position: absolute; inset: 8%;                                   /* the mat */
               width: 84%; height: 84%; object-fit: contain;
               mix-blend-mode: multiply; }                                      /* cutout mode */

.well[data-mode="photo"] .well__img {
               inset: 0; width: 100%; height: 100%;
               object-fit: cover; mix-blend-mode: normal; }                     /* location footage */

.well__scrim { position: absolute; inset: 0; background: var(--background);     /* #0F0F10 */
               opacity: 0.06; transition: opacity 240ms cubic-bezier(0.33,1,0.68,1); }
```

### State logic

- **Rest.** Scrim at 0.06 dims plate and photo together (perceived plate tone approximately `#DCDCDE`; ink on it still reads at 13.99:1). This kills the white-rectangle strobe during infinite scroll and reduces long-session luminance fatigue at grid scale.
- **Attended (hover or focus-within).** Scrim animates to 0 and the lit layer animates to 1, simultaneously, 180ms in; exit reverses over 240ms so the light lingers slightly. Because the photo multiplies against the lit layer beneath it, the whole well beams up as one lit object.
- **Item-detail hero.** No rest scrim; lit layer pinned at 1. The hero monitor is always on. The hero well additionally sits inside a 24px canvas mat bounded by its own hairline frame: a matted, framed print.
- **Loading.** The well holds `surface-inset` (dark) with the skeleton pulse. On decode, the whole plate stack crossfades in over 320ms. No white ever renders before its photo exists.
- **Failed image.** Show the bare plate with rest scrim, the vendor credit as a dark chip top-left (`#0F0F10` at 92%, hairline border, 11px mono caps in `#EDEDEF`), and the item name centered in 13px mono ink `#0F0F10` (15.80:1 on plate). Scraped catalogs break images daily; this state is first-class.
- **Unavailable.** The photo gets `filter: grayscale(1)` (a static filter, never animated) plus the UNAVAILABLE status token. The piece literally goes cold at grid-scan distance. No hazard stripes, no overlays.

### Non-negotiables

- Plates carry zero grain and zero tint so product color stays true. That is the entire point of a grading suite.
- Never animate `background-color`, `filter`, or the blend. Illumination is opacity-only, compositor-safe.
- The multiply blend dims true product whites by roughly 8%. This is a deliberate, uniform calibration applied identically to every vendor, which is fairer to vendors than per-source drift, and it is documented here so nobody "fixes" it.

---

## 5. Typography

Three families, each with one job. All free, all self-hostable, exact weights named. This kit is deliberately not the convergent Archivo-plus-Plex default.

| Voice | Family | Weights | Hosting |
|---|---|---|---|
| Display (title cards) | **Anybody** (variable, wdth 50 to 150) | 700, 800 | Google Fonts, OFL, via `next/font/google` with `axes: ['wdth']`, latin subset only |
| Body / UI | **Switzer** (variable) | 400, 500, 600 | Fontshare, ITF Free Font License, self-hosted woff2 via `next/font/local` |
| Data (camera report) | **Spline Sans Mono** (variable, wght 300 to 700) | 400, 500, 600 | Google Fonts, OFL, via `next/font/google`, latin subset only |

Anybody at width 125 is the projector title card: expanded, industrial-signage DNA, ownable. Switzer is the sharp neutral grotesk for everything read. Spline Sans Mono is the camera report, with three real weights so dense spec tables and quote columns keep hierarchy (a documented fix for the single-weight mono trap).

### Type scale

| Token | Size / line | Family, weight | Tracking | Use |
|---|---|---|---|---|
| `display-xl` | 64px / 68px | Anybody 700, wdth 125 | -0.01em | Hero headline only |
| `display-lg` | 40px / 44px | Anybody 700, wdth 125 | -0.005em | Page titles |
| `title` | 24px / 30px | Switzer 600 | -0.01em | Item detail title, panel titles |
| `heading` | 18px / 24px | Switzer 600 | 0 | Vendor group headers, section heads |
| `body` | 15px / 22px | Switzer 400 | 0 | UI copy, item names (500) |
| `body-sm` | 13px / 19px | Switzer 400 | 0 | Captions, helper text |
| `data` | 13px / 18px | Spline Sans Mono 400 | 0 | Dimensions, prices, counts, dates |
| `data-strong` | 13px / 18px | Spline Sans Mono 600 | 0 | Emphasized values: quotes, totals |
| `label` | 11px / 14px | Spline Sans Mono 500 | +0.08em, uppercase | Vendor credits, status tokens, rationed eyebrows |

The wordmark PROP HAUS is a locked lockup: Anybody 800, wdth 150, uppercase, +0.04em, 16px in the nav. It is never retyped at other settings.

### Typography rules

1. Numbers never appear in Switzer. Every figure is Spline Sans Mono. Belt and suspenders: `font-variant-numeric: tabular-nums` is declared globally.
2. **Dimension format, specified to the glyph:** `W 32 x D 30 x H 27 IN`, 13px mono, with each `x` set in `text-tertiary` and the values in `text-secondary` or `text-primary`.
3. Anybody never appears below 40px, with the single exception of the 16px wordmark lockup. Body text never stretches.
4. Sentence case everywhere except mono labels (vendor credits, status tokens, rationed eyebrows).
5. Eyebrow labels: maximum 1 per 3 sections. Vendor credits and status tokens use the same label style but are functional data and do not count against the ration. No section numbering, no em-dashes, no italics anywhere.
6. No serif. The screening-room voice is a projector title card and a camera report: sans and mono only.
7. Cycling search placeholders are set in mono and go static under `prefers-reduced-motion`.

---

## 6. Shape System

**Radius (the documented dual rule).** `0px` on structural chrome that touches a viewport or panel edge: top nav, filter sidebar, drawers, grid cells, full-width rows. `2px` on every nested object: buttons, inputs, image wells, tags, tokens, menus, the login panel. Single exception: human avatars are circles. No pills, no 8px+ rounding anywhere.

**Borders.** 1px hairlines carry all structure. Browse and related-item grids are ruled like a contact sheet: cells share single 1px `#26262A` seams edge-to-edge with no gutters, and generous 16 to 20px padding inside each cell. Inputs and overlays use `#3A3A40`. **Borders never disappear on hover; hover changes fill, not structure.** Seams are implemented as a 1px grid gap over a border-colored track, never per-card borders that double up.

**Focus.** Global `:focus-visible` is a 2px solid `tally` outline at 2px offset, everywhere, on every interactive element. Never a glow.

**Elevation and shadows.** None on cards or in-flow surfaces; elevation is expressed by surface tokens plus hairlines. Only floating overlays (dialogs, menus, cart drawer) get the one tinted shadow token: `0 24px 64px rgba(8, 8, 10, 0.55)` plus a 1px `#3A3A40` border, over the 60% scrim.

**Texture.** One texture in the product: 2.5%-opacity monochrome film grain (SVG feTurbulence tile, 256px, baseFrequency 0.9) on the canvas layer only. Never on plates, wells, panels, or overlays, and never animated. The nav separates with a hairline, never blur or shadow.

---

## 7. Spacing and Layout Grid

Base unit **4px**. Steps: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96.

| Dimension | Value |
|---|---|
| App max width | 1600px, centered; the ruled grid bleeds to the frame edges |
| Nav height | 56px |
| Filter sidebar | 264px fixed, sticky |
| Cart drawer | 440px |
| Grid cell padding | 16px (20px at 1440px and up) |
| Panel padding | 24px (login panel 32px) |
| Vertical section rhythm | 64px |
| Vendor group separation | 32px |
| Hero search max width | 760px |

**Ruled grid columns:** 2 below 768px, 3 from 768, 4 from 1280, 5 from 1680. Cells are 4:5 wells plus a fixed-slot placard (see item card). Zero gutters; seams do the separation.

**Ragged-content discipline.** Every card placard uses fixed slots: the name slot is always two lines tall (single-line names leave air, long names clamp), the meta rows always render at fixed height even when a value is missing. Missing price falls back to the key dimension; missing both leaves the slot empty at full height. Cells always align; the ruled grid never staggers.

---

## 8. Motion Language

**Philosophy.** Projection logic: nothing moves like paper, everything arrives like light coming up in a screening room. Motion exists only for hierarchy (entrances), state (status, loading), and feedback (hover, press). Only `transform` and `opacity` animate. Translation is capped at 8px; scale lives between 0.96 and 1.04. Cards never levitate and nothing loops decoratively. Springs via `motion/react`; curves are custom cubic-bezier, never linear.

| Pattern | Trigger | Spec |
|---|---|---|
| `well-reveal` | Image decode | Plate stack opacity 0 to 1, 320ms, `cubic-bezier(0.22, 1, 0.36, 1)`. Well holds dark inset until decode; white never flashes. |
| `beam-up` / `beam-down` | Well hover or focus | Rest scrim 0.06 to 0 and lit layer 0 to 1 together, 180ms in, `cubic-bezier(0.33, 1, 0.68, 1)`; exit 240ms so light lingers. |
| `quick-add` | Card hover reveal | Opacity 0 to 1 with scale 0.96 to 1, 160ms, same curve. |
| `grid-arrive` | Grid entrance and infinite-scroll append | Per-cell opacity 0 to 1 plus translateY 8px to 0, spring stiffness 380 damping 34, 40ms stagger, capped at 12 cells per batch. |
| `rail` | Cart drawer, mobile filter panel | translateX spring stiffness 320 damping 34 mass 1; scrim opacity 200ms ease-out; internal rows stagger 30ms. |
| `stamp` | Status token value change | Spring stiffness 640 damping 34, scale 1.15 to 1 with opacity 0 to 1. A rubber stamp pressed once onto the row; the color itself cuts instantly, an honest state change. Never loops. |
| `press` | Beam and ghost buttons | Scale 0.98, spring stiffness 600 damping 30, for the duration of the press. |
| `ticker` | Cart count change | Outgoing digit translateY -8px with fade, incoming from +8px, spring stiffness 500 damping 42. Digits are mono, so width never shifts. |
| `pulse` | Skeletons | Opacity oscillation between `#161618` and `#1C1C1F`, 1.6s ease-in-out infinite. No shimmer sweep. Wells keep their 4:5 shape and stay dark. |
| `search-focus` | Hero search focus | Border `#26262A` to `#3A3A40` over 150ms; scale 1 to 1.01, spring stiffness 380 damping 32. |

**Reduced motion.** Under `prefers-reduced-motion`: all transforms removed, entrances become opacity crossfades at half duration, springs become 120ms ease-out tweens, staggers removed, skeleton pulse slows to 2.4s, cycling placeholders go static.

---

## 9. Component Specifications

### 9.1 Top navigation / app chrome

56px bar, `canvas` background plus grain, 1px bottom hairline, radius 0, no blur or translucency. Left: PROP HAUS wordmark lockup (Anybody 800, wdth 150, uppercase, 16px, +0.04em) with `LOS ANGELES` beside it in 11px mono `text-tertiary`. Center: 40px search input on `surface-inset`, 2px radius, hairline border, mono placeholder. Right: Pulls link (Switzer 500 14px), cart glyph with count badge (`tally` fill, `#0F0F10` ink, 11px mono, 2px radius, rendered only when count > 0, digits animate with `ticker`), 28px circular avatar. Focus everywhere: the global 2px tally outline.

### 9.2 Home: hero + AI search + featured grid

Full-bleed canvas with grain. One eyebrow allowed (11px mono label, `LOS ANGELES INVENTORY`), which spends the page's ration. Then `display-xl` Anybody headline in sentence case, two lines max. The AI search bar is the hero object: 56px tall, `surface-inset`, hairline border, 2px radius, max 760px; mono placeholder cycles scene prompts ("Describe the scene. Try 70s bachelor apartment.") and goes static under reduced motion. On focus: `search-focus` motion plus the 2px tally outline. Below, the featured browse grid begins immediately as a ruled contact sheet, edge-to-edge. No marketing cards, no gradient panels.

**Marquee cell (v1.1).** The featured contact sheet opens with a lead frame: the first cell spans 2 columns by 2 rows inside the same ruled grid — identical seams, identical placard anatomy, name stepped up to 18px Switzer 600. Prefer a `plate_mode = "photo"` item so the lead frame is location footage, not a cutout. One marquee per page, home only. No text overlays on the well, no autoplay rotation, no carousel.

**Fold discipline (v1.1).** The hero is an overture, not a curtain: its vertical rhythm must leave the first row of light wells visibly cresting the fold at 1440×900. If the fold shows no lit plate, the hero is too tall. The photos are the only luminous thing on screen — so the first screen must contain photos.

### 9.3 Browse grid + filter sidebar + infinite scroll

264px sticky sidebar on `surface-raised`, radius 0, hairline right seam. Filters are edge-to-edge 36px list rows, never cards: name Switzer 400 14px left, count right-aligned 12px mono `text-tertiary`, hover fills `surface-overlay`, active row gets a 2px `tally` left border. Checkboxes are 14px squares, 2px radius; checked state fills `tally` with a `#0F0F10` check.

Grid: ruled cells sharing 1px hairline seams, zero gutters, 16px cell padding, columns per the layout table. The sticky toolbar above the grid carries a running count in 13px mono: `240 of 1,318 loaded`. Infinite scroll appends with `grid-arrive`; during fetch, skeleton cells hold the 4:5 dark wells with `pulse`.

### 9.4 Item card (build from this alone)

A grid cell: radius 0, 16px padding, transparent over canvas, the entire cell is one link.

1. **Light well.** 4:5, per Section 4 exactly: hairline frame, 2px radius, plate + lit layer + photo (multiply-contain in cutout mode, cover in photo mode) + 6% rest scrim. Hover/focus fires `beam-up` and scales the photo 1 to 1.025 (spring 380/34). Zero y-lift; cards never levitate.
2. **Quick-add.** 28px button bottom-right inside the well: `rgba(15,15,16,0.85)` fill, hairline border, 2px radius, plus icon in `#EDEDEF`. Fades in on hover/focus with `quick-add`. On coarse pointers (`@media (pointer: coarse)`) it is always visible; touch users are never locked out.
3. **Placard, 12px below the well, fixed slots.** Line 1: item name, Switzer 500 15px `text-primary`, fixed two-line slot with clamp. Line 2: subcategory, Switzer 400 13px `text-tertiary`, one line, always rendered. Line 3: vendor credit left, data right. The credit is a lender's credit line, not a SKU stamp: 11px mono 500 uppercase `text-secondary`, e.g. `NEWEL`, with an optional hairline underline on hover linking to the vendor. Right side: price in 13px mono tabular `text-secondary`, falling back to key dimension, falling back to empty at fixed height.
4. **Status.** When present, the status token (Section 9.10) sits in a fixed slot below the placard. Unavailable items also render the well's grayscale treatment.
5. **Focus.** The 2px tally outline draws around the well only.

### 9.5 Item detail

Two columns over canvas (stacked below 1024px). Left, max 640px: the hero light well, lit layer pinned on (always `#F4F4F6`), inside a 24px canvas mat bounded by its own hairline frame. Below, a strip of 64px thumbnail wells (2px radius, rest scrim active); the selected thumb gets a `border-strong` frame; switching crossfades the hero image over 200ms.

Right column: title 24px Switzer 600; vendor credit line directly beneath in 11px mono caps ("Courtesy of the vendor" framing, links to vendor page); then the spec sheet as hairline-ruled 44px rows: label Switzer 13px `text-tertiary` left, value 13px mono `text-primary` right, dimensions formatted `W 32 x D 30 x H 27 IN` with tertiary x glyphs. Rental price and terms in `data-strong`.

Primary action: the **beam button**, 44px, full column width, `#EDEDEF` fill, `#0F0F10` ink (16.39:1), 2px radius, hover to `plate-lit`, press via `press`. Secondary: "Save to pull," ghost button with hairline border. Status token sits directly above the buttons. Related items: one ruled row of standard item cards under an 18px heading.

### 9.6 Cart + project request

Right drawer, 440px, `surface-raised`, radius 0, hairline left seam, one overlay shadow, `rail` entrance. Items grouped under vendor headers: vendor name 18px Switzer 600 with mono item count and per-vendor subtotal right-aligned. Line items are edge-to-edge 72px rows with hairlines: 56px mini light well (rest scrim active), name Switzer 500 14px, price 13px mono, quantity stepper of two 28px square hairline buttons flanking a mono digit, quiet remove control. After submission, each row carries its status token inline; quoted rows show the vendor's actual amount.

Totals line is labeled honestly: `Estimate, pending vendor quotes` in 13px `text-tertiary`, with the figure in `data-strong`. This is a sourcing request, not a checkout, and the label says so at the exact moment users expect commerce.

Footer: project request fields (rental dates, production name, contact, notes) as `surface-inset` inputs with hairline borders; inline field errors render as 12px mono in `tally-text` directly under the offending field. Full-width beam button: "Send project request." Confirmation fires the `stamp` spring on a banner: "Request sent. 3 vendors notified."

### 9.7 Dashboard (projects / scene folders / paperwork)

The nav link and page title read **Dashboard** (renamed from Pulls, Sep 2026). "Pull" stays the verb in body copy — a set decorator still pulls for a scene — but the surface is the production's dashboard: one row per project; inside, one row per scene folder plus a single Paperwork folder for uploaded documents (COIs, W9s, invoices, call sheets). Scene rows carry the filmstrip below; the paperwork row carries a document glyph and a document count. Adding a scene and starting a project are rows with a plus glyph, never floating buttons. List view, never a card grid: full-width 64px rows with hairline seams, radius 0. Left: a filmstrip of three 40px mini light wells overlapping by 8px (empty slots render as `surface-inset` squares with hairline outlines, so a half-filled pull looks deliberate). Middle: pull name Switzer 500 15px. Right: mono item count and updated date in `text-tertiary`; aggregate status tokens when a request is in flight ("Newel confirmed 4 of 6 items. 2 pending."). Row hover fills `surface-overlay`. New pull is a row, not a floating button: "Start a new pull" with a plus glyph. Pull detail reuses the ruled browse grid plus a heading row with a ghost "Send as request" action.

### 9.8 Login (Google OAuth + magic link)

Canvas with grain; centered 400px panel on `surface-raised`, hairline border, 2px radius, 32px padding. Wordmark top, one sentence of body copy. Google button: beam-style light fill, dark ink, Google glyph at natural color, 44px. Hairline divider with mono `or`. Magic-link email input (`surface-inset`, mono placeholder) with a ghost submit: "Email me a link." Confirmation swaps the panel body via 180ms fade: "Check your email. The link is good for one hour." with the address echoed in mono. Errors: 12px mono `tally-text` under the field; system errors on a `tally-wash` row. Footer: "Sign in to keep your pulls." No illustration, no split screen, no testimonial.

### 9.9 States: loading, empty, error

**Loading.** Skeletons mirror the real layout exactly in `#161618` shapes with `pulse`. Image skeletons keep the 4:5 well shape and stay dark; pages never flash.

**Empty.** Quiet type only: an 11px mono label, one sentence of body copy, one action. "Nothing pulled yet. Pull items in from the grid." No illustrations, no mascots.

**Error.** Hairline-bordered rows with a 2px `tally` left rule, plain sentence in `text-primary`, detail in `text-secondary`, a ghost retry. "The request did not go through. Try again." Destructive confirms sit on `tally-wash`. Failed image loads use the Section 4 failed-image state: bare plate, vendor credit chip, item name centered in mono.

### 9.10 Status system

One component: **StatusToken**. 6px semantic dot plus 11px mono 500 uppercase label, transparent background, 1px hairline border, 2px radius, 3px 8px padding. Reused identically on cards, cart rows, pull rows, and item detail. Dots exist only inside tokens, never free-floating.

| State | Dot | Label text | Meaning |
|---|---|---|---|
| PENDING | `#8E8E96` | `text-secondary` | Request sent, awaiting vendor (house lights) |
| QUOTED | `#E3B341` | `text-secondary`, amount in `data-strong`: `QUOTED 145.00/WK` (always the vendor's real figure, never invented) | Vendor quoted, decision needed (standby) |
| CONFIRMED | `#58A87C` | `text-secondary` | Hold confirmed (go) |
| UNAVAILABLE | `#D25446` | `tally-text` (7.09:1) | Declined or gone (stop) |

State changes fire the `stamp` spring once. Unavailable items additionally get the grayscale well treatment and the copy "This piece went to another production. See related items."

---

## 10. Iconography Policy

Lucide (the shadcn default set), stroke style only, 1.5px stroke, rendered at 16px or 20px, in the text color of their context. Icons appear only when they carry operational meaning: search, cart, plus, close, chevron, external link, bookmark. Never decorative, never duotone, never filled, never emoji. Status is never conveyed by an icon alone; the StatusToken's dot plus label is the status language. No spot illustrations or mascots anywhere in the product.

---

## 11. Copy Voice

Production-set terse: the voice of a good coordinator on a working set. Short declaratives, sentence case, present tense. Verbs from set life: pull, hold, strike, wrap, send. Counts with consequence, always real, always mono. Zero exclamation points, zero em-dashes, no marketing adjectives, no cute personas.

| Moment | Copy |
|---|---|
| Search placeholder | "Describe the scene. Try 70s bachelor apartment." |
| Request confirmation | "Request sent. 3 vendors notified." |
| Pull progress | "Newel confirmed 4 of 6 items. 2 pending." |
| Unavailable item | "This piece went to another production. See related items." |
| Empty pull | "Nothing pulled yet. Pull items in from the grid." |
| Cart totals label | "Estimate, pending vendor quotes" |
| Search failure | "That search did not go through. Try again, or browse by category." |
| Login footer | "Sign in to keep your pulls." |

---

## 12. Brutalist Balance

**What we take from brutalism.** Honest visible structure: every grid is ruled with exposed 1px seams, contact-sheet style, no floating cards, no soft shadows on surfaces. Hard geometry: 0px structural edges, 2px maximum nested radius, flat fills. Extreme typographic scale contrast: 64px expanded title cards against 11px mono labels with almost nothing in between. Raw utilitarian data: monospaced camera-report metadata, undecorated list rows, real counts. One blunt hazard-family accent used like signal equipment, never like branding.

**How we soften it.** Seams come with generous 16 to 20px interior padding and 64px section rhythm, so density never reads as ERP cramp. The palette is dim and calibrated (velvet `#0F0F10`, 92-percent plates, rest-dimmed wells) instead of harsh white-on-black shouting. Motion is spring-physics polish with projector logic, light coming up rather than static harshness. The 8% mat inside every light well and the 24px hero mat give scraped photos a gallery finish. Copy is sentence-case and calm where pure brutalism would be all-caps aggressive. The result is rigid bones under a quiet, graded surface: structure you can feel, never structure that yells.

---

## 13. Anti-Patterns (Forbidden)

1. Pure `#000000` backgrounds, pure `#FFFFFF` surfaces, or any warm cream/beige/brass/espresso palette.
2. Purple/blue gradients, or gradients of any kind on surfaces.
3. Inter, Fraunces, Instrument Serif, or any serif anywhere.
4. A second accent hue. Red at full saturation. Red as a primary CTA (the beam button is the only primary treatment).
5. Numerals set in Switzer. Proportional figures anywhere data appears.
6. Pills, rounded corners above 2px on nested objects, any radius on structural chrome.
7. Box shadows on cards or in-flow surfaces. Blurred or translucent nav.
8. Removing or changing a border on hover. Hover changes fill only.
9. Free-floating status dots, decorative dots, section numbering ("01 / INDEX"), meta-labels, more than one eyebrow per three sections.
10. Em-dashes, exclamation points, fake-precise numbers, marketing adjectives in product copy.
11. White image frames flashing before decode. Photos rendered outside a light well. Grain or tint on plates.
12. Linear easing, layout-property animation, y-lift card hovers, shimmer skeleton sweeps, looping decorative motion.
13. Illustrations, mascots, or emoji in empty and error states.
14. Client-side guessing of cutout vs photo mode (the ingest flag is mandatory infrastructure).
15. Retyping the wordmark outside its locked lockup settings.

---

## 14. Tailwind v4 Theme Tokens

Paste into `app/globals.css`. Follows shadcn/ui naming where sensible; Answer Print extensions are additive.

```css
@import "tailwindcss";

:root {
  /* surfaces */
  --background: #0F0F10;
  --foreground: #EDEDEF;
  --card: #161618;
  --card-foreground: #EDEDEF;
  --popover: #232327;
  --popover-foreground: #EDEDEF;
  --surface-inset: #1C1C1F;

  /* actions: the beam button is primary; red is signal, never go */
  --primary: #EDEDEF;              /* beam fill */
  --primary-foreground: #0F0F10;   /* 16.39:1 */
  --primary-hover: #F4F4F6;
  --secondary: #1C1C1F;
  --secondary-foreground: #A7A7AE;
  --muted: #1C1C1F;
  --muted-foreground: #8E8E97;     /* AA on every surface it sits on */
  --accent: #D25446;               /* tally, fill tier */
  --accent-foreground: #0F0F10;    /* 4.65:1, AA at badge sizes */
  --accent-text: #E08573;          /* tally, text tier: 7.09:1 on canvas */
  --destructive: #D25446;
  --destructive-foreground: #0F0F10;
  --destructive-wash: #2A1617;

  /* structure */
  --border: #26262A;
  --border-strong: #3A3A40;
  --input: #1C1C1F;
  --ring: #D25446;

  /* light wells */
  --plate: #E9E9EB;
  --plate-lit: #F4F4F6;
  --well-scrim-opacity: 0.06;
  --well-inset: 8%;

  /* workflow status (dots; labels use secondary / accent-text) */
  --status-pending: #8E8E96;
  --status-quoted: #E3B341;
  --status-confirmed: #58A87C;
  --status-unavailable: #D25446;

  /* text tiers */
  --text-secondary: #A7A7AE;
  --text-tertiary: #8E8E97;
  --text-disabled: #5A5A62;

  /* overlay */
  --scrim: #08080A;
  --shadow-overlay: 0 24px 64px rgba(8, 8, 10, 0.55);

  --radius: 2px;                   /* nested objects; structural chrome is 0 */
}

@theme inline {
  /* colors */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-surface-inset: var(--surface-inset);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary-hover: var(--primary-hover);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent-text: var(--accent-text);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-destructive-wash: var(--destructive-wash);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-plate: var(--plate);
  --color-plate-lit: var(--plate-lit);
  --color-status-pending: var(--status-pending);
  --color-status-quoted: var(--status-quoted);
  --color-status-confirmed: var(--status-confirmed);
  --color-status-unavailable: var(--status-unavailable);
  --color-text-secondary: var(--text-secondary);
  --color-text-tertiary: var(--text-tertiary);
  --color-text-disabled: var(--text-disabled);
  --color-scrim: var(--scrim);

  /* fonts (wired to next/font variables) */
  --font-display: var(--font-anybody), "Anybody", sans-serif;
  --font-sans: var(--font-switzer), "Switzer", sans-serif;
  --font-mono: var(--font-spline-mono), "Spline Sans Mono", monospace;

  /* radius: dual rule */
  --radius-none: 0px;
  --radius-sm: 2px;
  --radius-DEFAULT: 2px;
  --radius-full: 9999px;           /* avatars only */

  /* spacing: 4px base plus named layout dims */
  --spacing: 4px;
  --spacing-nav: 56px;
  --spacing-sidebar: 264px;
  --spacing-drawer: 440px;
  --spacing-cell: 16px;
  --spacing-section: 64px;

  /* shadows */
  --shadow-overlay: var(--shadow-overlay);

  /* motion */
  --ease-reveal: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-attend: cubic-bezier(0.33, 1, 0.68, 1);
  --duration-micro: 160ms;
  --duration-attend-in: 180ms;
  --duration-attend-out: 240ms;
  --duration-reveal: 320ms;
}
```

---

## Appendix: Decision Record

**Winner.** ANSWER PRINT, the highest scorer (23.5) and ranked first by both the audience-resonance and product-usability judges. No disqualifying flaw surfaced; the taste judge's "anonymous face" critique is real and is resolved below rather than treated as fatal, because the system's bones (projector attention logic, red-never-means-go, complete image lifecycle) were judged best in field.

**Judge-flagged weaknesses resolved.**
- *Anonymous surface kit (Archivo + IBM Plex Mono + Radix #E5484D):* all three swapped. Display is Anybody Expanded, body is Switzer, mono is Spline Sans Mono with three working weights, and the red is a custom two-tier tally (`#D25446` / `#E08573`), not Radix red 9.
- *Grid glare and infinite-scroll fatigue:* PLINTH's 6% rest scrim grafted into every well; wells now dim at rest and light under attention, which also strengthens the projector thesis.
- *Hand-wavy ingest flag:* LOAD-IN's four-corner, 0.88-threshold heuristic adopted verbatim and stored at ingest.
- *Thin 1px focus ring:* replaced by LOAD-IN's global 2px accent outline at 2px offset.
- *Tertiary text at a hair above AA:* lifted to `#8E8E97`, verified 4.82:1 or better on every stated surface.
- *Accent text at a hair above AA:* two-tier accent; all small red text uses `#E08573` at 5.79:1 or better; the cart badge combination verified at 4.65:1.
- *Hover-only quick-add:* persistent on coarse pointers.
- *Ragged-content grid:* fixed placard slots with documented fallback order.
- *Missing broken-image state:* LOAD-IN's bare-plate fallback adopted.
- *Font payload:* latin-only subsets, named weights, display axis loaded deliberately.

**Other grafts, per judge recommendation.** Pulls naming and the lender-credit vendor framing (PLINTH); the stamp spring for status changes, dimension glyph spec, running grid count, cart digit ticker, inline mono field errors, and count-with-consequence copy (STRIPBOARD); grayscale unavailable wells and the borders-never-disappear rule (LOAD-IN); QUOTED tokens carrying the real vendor amount, the honest estimate label, the unavailable redirect line, and the 24px hero mat (PLINTH). Hazard stripes, condensed-caps empty states, and gradient plates were evaluated and rejected as off-story.