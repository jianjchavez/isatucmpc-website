# MemberFolio Access Pop-up — Design

**Date:** 2026-06-20
**Status:** Approved (design); ready for implementation plan
**Repo:** ISATUCMPC Website (Astro, Cloudflare Pages)

## Problem

The site's **"Member Login"** buttons (header desktop, mobile menu, footer) link
straight to `https://app.isatucmpc.coop`. New members arrive at the portal with no
guidance on how to create their online account and sign in. We have a polished
step-by-step how-to (`memberfolio-howto_3.html`) and want to surface it at the
point of login — **without** getting in the way of returning members.

Key framing decision: the audience is **existing cooperative members** activating
**online access**. The how-to is NOT a "join the cooperative" funnel (that is the
separate `/membership` → Apply-to-Join flow). All copy reflects this.

## Goal

When a visitor clicks **Member Login**, open a pop-up ("gateway") that:
- Briefly shows what MemberFolio offers (its main member-facing features).
- Offers two clear paths:
  - **Sign in** (existing member) → go straight to the portal. **No instructions.**
  - **Sign up** (first time) → reveal the **full how-to guide**.
- Is easy to dismiss (×, ESC, click-outside, "Close"/"Maybe later"), so returning
  members are never blocked.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Trigger | **On click only** of any "Member Login" control. No auto-popup. |
| Structure | Two-view modal: **gateway** → **how-to**. |
| Existing members | "Sign in" goes directly to the portal; no walkthrough. |
| New members | "Sign up" → "Show me how" reveals the full how-to. |
| How-to content | Load the **whole** how-to file (all slides), via an isolated `<iframe>`. |
| Slide 14 | Removed (editor-only "Appendix — Storyboard"). Deck now 13 slides. |
| Deck chrome (in-site) | Trim presenter/video controls: keep **Prev/Next + counter/progress**; remove **Play/autoplay, Notes panel, Fullscreen, countdown timer**. |
| Header copy | "Access MemberFolio" + "Already an ISATUCMPC member? Set up your online access to your capital shares, loans, statements and more — anytime." (no "join", no "savings"). |
| Feature strip | Gateway shows MemberFolio's main features as check-mark pills. |
| Implementation | Native `<dialog>` + vanilla JS, progressively enhanced (Approach A). |

## Architecture

### Components / files

- **`src/components/MemberLoginModal.astro`** (new)
  - Renders a single native `<dialog>` with two views (gateway, how-to) and the
    interceptor `<script>`. Mounted **once** in `PageLayout.astro` after `<Footer />`.
  - Self-contained: no props needed initially. Portal URL is a module constant
    (`https://app.isatucmpc.coop`).
- **`src/layouts/PageLayout.astro`** (edit)
  - Add `<MemberLoginModal />` after `<Footer />`.
- **`public/memberfolio-howto.html`** (new asset)
  - The how-to deck, copied from `memberfolio-howto_3.html` with slide 14 removed
    and the deck chrome trimmed (see above). Served same-origin; loaded lazily into
    the iframe only when "Sign up → Show me how" is clicked.
- **`public/_headers`** (edit)
  - Add `'self'` to the `frame-src` CSP directive so the same-origin how-to iframe
    is allowed. (Currently `frame-src https://challenges.cloudflare.com;`.)
- **`docs/ARCHITECTURE.md`** (edit)
  - Record the new component, the new `/public/memberfolio-howto.html` asset, the
    page-count/structure note (no new route — modal is global), and the CSP change.
    Bump "Last verified".

### Trigger wiring (progressive enhancement)

The "Member Login" controls stay real anchors: `<a href="https://app.isatucmpc.coop">`.
The modal's script selects them by href
(`a[href="https://app.isatucmpc.coop"]`) and intercepts clicks:

1. If `dialog.showModal` is unavailable → do nothing; the link navigates to the
   portal (fail-safe, no dead button).
2. Otherwise `preventDefault()`, remember the trigger (to restore focus on close),
   reset to the gateway view, and `showModal()`.
3. If the click came from inside the mobile menu, close that menu first.

No markup change to `Button.astro` or the existing links is required (selector keyed
on the portal href). The footer's plain `<a>` to the portal is covered too.

### Two views inside the dialog

**Gateway view (default):**
- Header bar (navy): title "Access MemberFolio" + reframed subtitle. Close (×).
- Signature gradient rule.
- **Feature strip:** "Everything in one member portal" + check-mark pills:
  Capital shares & dividends · Loans & balances · Loan calculator · Apply for loans ·
  Statements & certificates · Membership classification · Welfare fund · Two-factor security.
  (Sourced from MemberFolio's actual member-facing features.)
- **Two choice cards:**
  - *Existing member* — "Sign in" → `<a href="portal">` (direct).
  - *First time here* — "Sign up" → button "Show me how →" switches to the how-to view.

**How-to view:**
- Slim bar with a **Back** button (returns to gateway) + title.
- `<iframe>` of `/memberfolio-howto.html` (lazy `src` set on first reveal).
- Footer: "Close" + primary "Continue to MemberFolio →" (`<a href="portal">`).

### How-to deck changes (`public/memberfolio-howto.html`)

Derived from `memberfolio-howto_3.html`:
1. **Slide 14 removed** (already done in source): the editor "Appendix — Storyboard"
   table. Slide count derives dynamically in the deck JS (`N = slides.length`), so the
   counter self-corrects to 13; the static fallback text is updated to match.
2. **Trim deck chrome for embedding:** remove the Play/autoplay button + countdown
   timer, the Notes (narration/VO) panel and its toggle, and the Fullscreen button.
   Keep **Prev / Next**, the progress bar, and the "Slide X of 13" counter. The
   `data-vo` narration attributes can remain in markup (harmless) but the notes UI is
   removed. Rationale: those are video-production controls, irrelevant to members.

## Accessibility

- Native `<dialog>` provides focus trapping, ESC-to-close, and inert background.
- `aria-labelledby` points at the title; close buttons have `aria-label`.
- Focus moves into the dialog on open and **returns to the triggering link** on close.
- The iframe has a descriptive `title`.
- Backdrop click closes (click target === dialog).
- Honors `prefers-reduced-motion` for the open animation.
- Must keep the existing **pa11y CI** green. Note: pa11y crawls rendered pages; the
  dialog is closed by default, so its open state is not auto-audited — verify the open
  state manually (and optionally add a pa11y action to open it).

## Error / edge handling

- **No JS / no `<dialog>` support:** "Member Login" navigates straight to the portal.
- **Iframe blocked or slow:** content is lazy-loaded on the Sign-up path only; the
  "Continue to MemberFolio →" CTA is always available regardless of iframe state.
- **Multiple triggers on a page:** all share one dialog instance; last trigger wins
  for focus return.
- **Asset size:** the how-to (~740KB, embedded screenshots) loads only on demand
  (Sign-up click), so default page weight is unaffected. Image optimization of the
  embedded screenshots is a possible follow-up, not required for this change.

## Out of scope

- Changing the MemberFolio app's own "Join Our Cooperative" heading (separate repo;
  noted as a recommended follow-up).
- Any change to the `/membership` Apply-to-Join funnel.
- Re-authoring the how-to content beyond slide-14 removal and chrome trimming.
- Optimizing/replacing the embedded screenshots.

## Verification

- `./node_modules/.bin/astro check` → 0 errors / 0 warnings.
- `./node_modules/.bin/astro build` → succeeds; confirm `dist/` contains the modal
  markup and `memberfolio-howto.html`.
- Manual: each Member Login control opens the gateway; Sign in → portal; Sign up →
  how-to loads; Back/Close/ESC/backdrop all work; focus returns to trigger; mobile
  full-screen layout; deck pages 1→13 with trimmed chrome.
- pa11y CI stays green.
- `public/_headers` CSP validated (same-origin iframe loads; no console CSP errors).
