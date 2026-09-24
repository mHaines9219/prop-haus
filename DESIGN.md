# PARTY LINE

**A county phonebook: cream ad boxes on a green vinyl binder.**

Version 1.0 (Sep 2026). Replaces Nocturne (Aug 30 2026), which replaced Answer Print. Reference: the classified spread of a 1970s rural directory (McLean County, Kentucky): cream ads with ink rules on a forest-green vinyl cover, condensed red gothic headlines, coral phone-number tags, Helvetica listing lines, and ink line drawings.

---

## 1. Concept

Prop Haus is a directory. Every prop house in town has a listing; every piece is an ad. The product borrows the page structure of the old phonebook because it already solves the problem the app has: hundreds of small, competing, equally-weighted listings that a reader scans by headline, picture, and one number.

The four materials, and nothing else:

| Material | Role | Hex |
|---|---|---|
| **Binder** | the green vinyl the book is bound in: the ground, the nav, the footer | `#1f4b3b` |
| **Paper** | the cream page and the whiter ad stock | `#f3eddc` / `#faf6ea` |
| **Ink** | text, rules, drawings | `#17140f` |
| **Coral** | the phone-number tag and the red headline | `#e8735a` / `#c9432b` |

The rule the whole system follows: **text is printed on paper, never on vinyl, except chrome.** Anything a user reads sits in an ad box or on a page sheet. The vinyl is only ever a ground with cream labels on it (nav links, section eyebrows, the footer credit).

---

## 2. Principles

1. **Everything is a listing.** Items, categories, steps, forms: all ad boxes. Same stock, same rule, same headline treatment. Hierarchy comes from size and position on the page, not from a different component.
2. **One number per ad.** Each box gets at most one coral tag: the price, the count, the primary action. Two tags in one box is a layout bug.
3. **Rules, not shadows.** Structure is drawn with 1.5px ink rules and 2px heavy rules. The only shadow is the hard offset (`3px 3px 0 ink`) that a box gets on hover, or that a sheet gets to sit on the vinyl. No blur, no glow, no gradient inside a box.
4. **No rounded corners.** The radius tokens are all 0. The single exception is `rounded-full` for a count bullet.
5. **Red means "read this," not "danger."** Coral is the brand: headlines, tags, primary buttons. Destructive actions use the deeper red on paper with an explicit label; they never rely on color alone.
6. **Print behaviour, not screen behaviour.** Entrances are paste-ups (fade, 6px rise); hovers lift a box off the page; nothing glows, spins, or slides in from off-screen.

---

## 3. Two scopes, one token set

The tokens are defined twice in `app/globals.css`:

- **BINDER** (`:root`, the default theme, `data-theme="dark"`): background is vinyl, foreground is cream, cards are a lifted green, borders are cream at 24%.
- **SHEET** (`.sheet`, and `:root[data-theme="light"]`): background is paper, foreground is ink, cards are ad stock, borders are ink at 26%, strong borders are solid ink.

`@theme inline` maps every semantic token straight to its variable, so a `bg-card` or `text-text-tertiary` utility re-resolves wherever a `.sheet` starts. **Components never need to know which scope they are in.** Build from the semantic tokens and the component prints correctly on either surface.

Where a scope starts:

- `PageShell` wraps `<main>` in a `.sheet` with a 1.5px ink rule and a 2px gutter to the vinyl. Every interior page is a page of the book.
- `ItemCard`, the category boxes, the how-it-works boxes, the hero ad, and the AI modal are each their own `.sheet`, so they print as paper on the home page's vinyl.
- The light theme puts the whole document in the sheet scope: the book lies open. The nav and footer stay vinyl in both themes because they use the constants (`bg-binder`, `text-paper`), not the semantic tokens.

Constants are exposed as utilities for chrome and for anything that must not flip: `bg-binder`, `bg-paper`, `bg-paper-lit`, `bg-paper-deep`, `text-ink`, `border-ink`, `bg-coral`, `text-coral-deep`, `bg-coral-lit`.

---

## 4. The picture (LightWell)

Every inventory photo prints on paper inside a hairline ink rule (`components/ap/light-well.tsx`). This is the signature move: a photo is never a bare image tile and never sits on vinyl.

- `mode="cutout"` (default; most scraped inventory has a white background): the image is inset 7% on a paper plate with `mix-blend-mode: multiply`, so the white vanishes and only the object is printed, like the line drawings in the reference.
- `mode="photo"`: full-bleed on white stock, no blend.
- `lit`: brighter (pure white) stock, used for the hero print on the item page.
- Hover inside a `.group` scales the print 2.5%.

---

## 5. Typography

| Face | Loaded as | Used for |
|---|---|---|
| **Archivo** (variable, `wdth` axis) | `--font-archivo` via next/font | `font-heading`: the ad-headline gothic, drawn at **80% width**, weight 800, uppercase. Nav, headlines, labels, buttons, tags. Also `font-mono` at full width: the phonebook has no monospace, so every data slot (prices, counts, IDs) is bold gothic like a phone number. Tabular figures come from `body { font-variant-numeric: tabular-nums }`. |
| **Fraunces** (variable, `SOFT`/`WONK`/`opsz`) | `--font-fraunces` via next/font | `font-display`: the bank-sign serif. Page `<h1>`s and the hero. Weight 700, `SOFT 40`. |
| **Helvetica Neue** (system) | none | `font-sans`/body: listing copy, form values, table cells. |

Component classes in `globals.css`:

- `.ad-headline`: condensed 800 uppercase in `--accent-text` (red on paper, light coral on vinyl), line-height 0.95. Item names, category titles, step titles, modal titles.
- `.listing`: 11px uppercase Helvetica, 0.08em tracking, with a coral `•` drawn between child `<span>`s. "FERTILIZER • CHEMICALS • LIME". Subcategory lines, hints, hero eyebrow.
- `.tag` / `.tag-lg`: the coral phone-number block, 1.5px ink rule, condensed 800 uppercase in ink.

Scale (px): eyebrow 10–11 · listing 11 · caption 12–13 · body 14–15 · card headline 15 (18 marquee) · step headline 22 · modal title 24 · page title 28–32 · hero `clamp(42px, 6vw, 82px)`.

---

## 6. Rules and layout

- Hairline: 1px `border-border` (ink 26% / cream 24%). Table rows, spec rows, dividers.
- Box rule: 1.5px `border-ink`. Every ad box, every sheet, inputs on focus.
- Heavy rule: 2px `border-ink`. The search bar, table heads, the line under a modal header, the hero's bottom strip.
- Gutters: ad boxes sit in a grid with an 8–12px gap (`SeamGrid`: `gap-2 sm:gap-3`). The grid draws no seams of its own; each box carries its rule.
- Page width: 1400px, 12–20px side gutters. The sheet has an 8–12px vinyl gutter around it.

---

## 7. Color tokens

Binder scope → sheet scope:

| Token | Binder | Sheet |
|---|---|---|
| `background` | `#1f4b3b` | `#f3eddc` |
| `foreground` | paper | ink |
| `card` | `#275a47` | `#faf6ea` |
| `surface-inset` | `#173a2e` | `#e6dec6` |
| `border` | paper 24% | ink 26% |
| `border-strong` | paper 60% | ink |
| `accent` (block) | coral | coral |
| `accent-text` | `#f4a28f` | `#c9432b` |
| `accent-foreground` | ink | ink |
| `destructive` | `#ff6a55` | `#b3261e` |
| `status-pending` | paper 55% | ink 45% |
| `status-quoted` | `#e9b44c` | `#c98a1e` |
| `status-confirmed` | `#8fd3a8` | `#2f7d4f` |
| `status-unavailable` | coral | `#c9432b` |
| `text-secondary` / `tertiary` | paper 80% / 64% | ink 78% / 62% |

Any new color token needs a value in **both** blocks.

The vinyl has a grain (an inline SVG `feTurbulence` at 9% white) over two soft radial sheens. Paper has the same grain at 5% ink and no sheen.

---

## 8. Motion

- Paste-up: `opacity 0→1, y 6→0`, spring 380/34, staggered 35ms per cell, capped at 12 cells.
- Lift on hover: `translate(-1px,-1px)` + hard shadow `3px 3px 0 ink`, 150ms `--ease-attend`.
- Print reveal: photo fades in over 320ms `--ease-reveal` once loaded.
- Modals: fade + 20px rise, spring 340/30; backdrop is `--scrim` at 70%, no blur.
- Everything respects `prefers-reduced-motion` via Motion's `useReducedMotion`.

---

## 9. Components

### 9.1 Chrome: nav and footer
`SiteNav`: 56px vinyl band. Left: index tabs. The wordmark is a cream tab (`bg-paper-lit`, ink rule, condensed 800), the city a coral tab. Right: cream condensed links, theme toggle, cart (count is a coral bullet), account. A 1px ink line closes the band. `SiteFooter`: vinyl, the publisher's line in spaced cream caps.

### 9.2 The home page
Straight on the vinyl, three sections of ad boxes:
- **The big ad**: the page's one full-width listing. Listing eyebrow, Fraunces headline, red italic slogan, body line, the search bar, "Try" links, a line drawing on the right (lg+), and a bottom strip split by a 2px rule holding the two "phone numbers": pieces in the catalog and prop houses.
- **How it works**: four small ads, number greyed inside the red headline, ink icon.
- **Classified by department**: the category column. Big red condensed headline stacked at the ampersand, listing number bottom-left, count as the coral tag.

Section eyebrows on vinyl: 11px condensed cream caps with a short coral bar.

### 9.3 The search bar (`HeroSearch`)
A ruled listing box, not a pill: 2px ink rule (coral on focus), cream field, magnifier, then three actions separated by ink rules: attach, AI MODE (a tab that fills light coral when armed), and SEARCH, the coral block that caps the bar. A listing-line hint below.

### 9.4 The ad box (`ItemCard`)
Its own `.sheet`. 1.5px ink rule, 12px padding. Picture (LightWell) with a hover-revealed coral quick-add square. Then fixed-height slots so rows align: red condensed name (2 lines), listing subcategory, vendor in small condensed caps bottom-left, price in a coral tag bottom-right. `marquee` spans 2×2 and steps the headline to 18px.

### 9.5 Item page
Gallery: the print on white stock inside a ruled mat, thumbnails ruled coral when selected. Right column: name, "Courtesy of" credit, description, ruled spec rows, enrichment chips, then the actions: Add to cart is the coral block, the others are outlined.

### 9.6 Overlays
Modal and drawer: a `.sheet` with a 1.5px ink rule and the hard overlay shadow (`0 0 0 1px ink, 6px 6px 0 rgba(0,0,0,.35)`), laid on a 70% scrim. Header closed by a 2px rule. Primary action is the coral block, secondary is outlined ink.

### 9.7 Tables and tabs
Ledger: 2px ink rule under condensed 11px column heads, hairline row seams, hover changes fill only. Tabs are index tabs on a hairline; the active one carries a 2px ink rule on the seam.

### 9.8 Forms
Inputs: 1px hairline on ad stock, solid ink on hover/focus, no glow. Labels: 11px condensed caps. Primary submit: coral block with ink rule. Secondary: outlined ink. Chips and pressed toggles: `border-accent text-accent-text`.

### 9.9 Loading and empty
Skeleton boxes carry a 40% ink rule and grey slots. Empty states are a ruled band (`border-y`) with a condensed eyebrow and one sentence.

### 9.10 Status
`StatusToken`: a listing bullet (8px, colored by tone) and an 11px bold label inside a strong rule on ad stock. Dots exist only inside a token. Four tones: pending, quoted, confirmed, unavailable; every domain status maps onto one of them in `status-token.tsx`.

---

## 10. Copy voice

Directory voice: short, declarative, a little folksy on the home page ("Working to keep your production dressed."), plain in the tool. Labels are nouns in caps. No exclamation marks. Never say Prop Haus is an insurer, broker, or agent.

---

## 11. Do / don't

- Do put every photo in a LightWell. Don't render a bare `<img>`.
- Do build from semantic tokens. Don't hard-code hex, and don't use Tailwind's palette (`emerald-500`, `zinc-800`).
- Do give a box one coral tag. Don't stack two.
- Do use `.sheet` when something must read as paper on the vinyl. Don't invert colors by hand inside a component.
- Do keep radius 0. Don't add `rounded-md` to anything; the token is 0 anyway, but don't rely on it being ignored.
- Don't reintroduce Nocturne's acid green, Answer Print's tally red, or any blurred glow.
