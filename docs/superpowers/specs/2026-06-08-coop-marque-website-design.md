# Co-operative Marque on the ISATUCMPC Website — Design

**Date:** 2026-06-08
**Status:** Approved (design), pending implementation
**Source of rules:** *The global Co-operative Marque — A guide for users* (ICA, v2.0, Oct 2015), `~/Downloads/marque_guidelines_en_0.pdf`
**Assets:** `~/Downloads/Coop_marque/` (marque), `~/Downloads/English_slogan.zip`, `~/Downloads/English_key_messages.zip`

## Goal

Replace the three text placeholders that the codebase already flagged with TODOs
(*"swap this text badge for the official COOP Marque logo once DotCoop sends the
asset"*) with the official Co-operative Marque, and apply the marque + slogan +
one key message elsewhere where it strengthens the cooperative identity — all in
full compliance with the ICA marque guidelines.

This is **alignment-device** usage (guide sections 2.0–6.0): the marque sits
*next to* ISATUCMPC's own identity as a credential. It is **not** "full adoption"
(making coop part of our own logo), which would require separate ICA approval.

## Guideline rules that bind this work

- Use an **official master file, unaltered**. Never stretch, distort, rotate/slant,
  crop, recolor, or use as a watermark/background.
- Colour must be one of the **seven signature colours**: black ("home" colour),
  red, orange, blue, turquoise, emerald green, spring green. **Plum is reserved
  for the ICA — never use it.**
- On dark/coloured backgrounds use the **white/reversed** master. **Never put the
  marque in a box or containing shape** — reverse it onto the colour instead.
- Respect the **exclusion zone**: clear space all around ≥ half the height of the
  "c" in "coop".
- Respect **minimum size** (~12 mm print ≈ legible on screen). All our placements
  are comfortably larger.
- For digital, use the **.png** (or .jpg) master, not the .eps (print only).
- Website and email signature are **explicitly endorsed** uses; the guide
  recommends placing the marque alongside existing identity/credential marks
  (its own website mockup shows it in the footer).

## Decisions

| Decision | Choice |
|----------|--------|
| Light-background marque colour | **Orange** (`coop_orange`), kept clear of the brand-orange `#FE9900` text to avoid a two-oranges clash |
| Dark-background (navy) treatment | **White/reversed** masters |
| Footer asset | **Slogan lockup** (marque + "Co-operative enterprises build a better world") |
| Key message | **Message 1 — "People together are stronger"**, one only |
| Asset format | Official **PNG** masters, copied unaltered into `public/coop-marque/` |

## Architecture

### New component: `src/components/CoopMarque.astro`

A single chokepoint so the marque is always rendered compliantly. All four
placements use it; no raw `<img>` to a marque file anywhere else.

Props:

- `variant`: `'marque' | 'slogan' | 'message'` — which lockup
- `color`: `'orange' | 'white' | 'blk'` (extensible to the other signature
  colours) — selects the master file
- `message`: `1`–`7` — required when `variant='message'`
- `size`: display width (e.g. a Tailwind width class or rem value); height is
  always `auto`
- `class`: optional extra classes for positioning/clear-space

Behaviour:

- Resolves to the correct PNG under `/coop-marque/…` from `variant` + `color`
  (+ `message`).
- Renders `<img>` with `object-contain` and an explicit width + `height: auto`
  so the aspect ratio can **never** be distorted.
- Applies built-in **clear-space** padding (≥ half cap-height) so the exclusion
  zone is honoured regardless of surrounding layout.
- Emits descriptive **alt text**, e.g. `"Co-operative Marque — verified .coop
  cooperative"` / `"… — Co-operative enterprises build a better world"` /
  `"… — People together are stronger"`. (Decorative-only instances may use empty
  alt where the adjacent text already conveys it — chosen per placement for a11y.)
- Never wraps the marque in a border/background box.

### Asset files copied to `public/coop-marque/` (original filenames)

- `coop_orange.png` — marque only, light backgrounds (placements 2, 3)
- `coop_white_slogan_en.png` — slogan lockup, navy footer (placement 1)
- `coop_white_message1_en.png` — key message 1, navy Principles section (placement 4)

(`coop_white.png` / `coop_blk.png` may also be copied for completeness/future use.)

## Placements

1. **Footer** (`src/components/Footer.astro`, navy `bg-navy`)
   White **slogan lockup** as a dedicated identity block with clear space.
   The existing "Verified .coop cooperative" line stays as supporting microcopy.

2. **Home trust strip** (`src/pages/index.astro`, light `bg-brand-bg`)
   Replace the ✓ glyph + bordered pill with the **orange marque** beside
   "Verified .coop cooperative". **Remove the pill border** so the marque is not
   enclosed in a containing shape (guideline "NEVER box the marque").

3. **About → Affiliations card** (`src/pages/about.astro`, white card)
   Replace the ".COOP" text eyebrow with the **orange marque**. Card retains its
   title + description. Generous clear space inside the card.

4. **About → identity band after 7 Principles** (`src/pages/about.astro`)
   A light `bg-brand-bg` band with the **black key-message 1 lockup** ("People
   together are stronger"), centered, with clear space, as a coda to the
   principles/identity block.

   > **Asset bug (discovered during implementation):** the ICA
   > `English_key_messages` zip ships a mislabeled `coop_white_message1_en.png`
   > that actually contains the spring-green artwork (not white). The genuine
   > white master for message 1 is missing (messages 2–7 white masters are
   > correct). Rather than recolor (forbidden), message 1 is placed in **black on
   > a light background** — fully compliant — instead of white on the navy
   > principles section. Report the mislabeled file to DotCoop / identity.coop.

## Out of scope (YAGNI)

- Using all 7 key messages (only message 1).
- Slogan/key-message lockups on every page.
- "Full adoption" (marque as part of the ISATUCMPC logo) — needs ICA approval.
- Converting masters to SVG (no local vector tooling; hand-tracing would be an
  unauthorized alteration). PNG masters are the sanctioned digital format.

## Verification

- `./node_modules/.bin/astro check` → 0 errors / 0 warnings.
- `./node_modules/.bin/astro build` → succeeds; confirm marque files present in
  `dist/` and referenced by the built HTML.
- `pnpm pa11y` (or existing a11y test) → no new violations; alt text present.
- Visual smoke: home, about, footer render the marque undistorted, correct
  colour per background, with clear space and no bounding box.
- Update `docs/ARCHITECTURE.md` (new component + assets + dependency-free) and
  bump its "Last verified" date, per `CLAUDE.md`.
