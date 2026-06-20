# MemberFolio Access Pop-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Member Login" gateway pop-up that lets existing members go straight to the MemberFolio portal and shows new members the full how-to guide.

**Architecture:** A single native `<dialog>` component (`MemberLoginModal.astro`) mounted once in `PageLayout.astro`. Its interaction logic lives in a pure, unit-tested `memberfolio-modal-logic.ts` module (mirrors the existing `eligibility-logic.ts` pattern). The "Member Login" links are intercepted by href; if JS/`<dialog>` is unavailable they navigate to the portal (progressive enhancement). The full how-to deck is served as a same-origin static asset (`public/memberfolio-howto.html`) and lazy-loaded into an `<iframe>` only on the Sign-up path.

**Tech Stack:** Astro 6, TypeScript, Tailwind v4, native `<dialog>`, Vitest + jsdom, Cloudflare Pages (`public/_headers` CSP).

## Global Constraints

- **Audience framing:** existing members activating *online access* — never "join the cooperative", never the word "savings". Use "capital shares", "loans", "statements".
- **Portal URL (verbatim):** `https://app.isatucmpc.coop` (no trailing slash; matches existing links in `Header.astro` and `Footer.astro`).
- **pnpm v11 gotcha:** run installs with `--ignore-workspace --ignore-scripts`; invoke `astro`/`vitest` via `./node_modules/.bin/`.
- **Verify before "done":** `./node_modules/.bin/astro check` (0 errors / 0 warnings) + `./node_modules/.bin/astro build`; `pnpm test` green; `pnpm a11y` (pa11y) green.
- **No Tailwind class collisions:** use custom state classes `is-hidden` / `is-active` (NOT Tailwind's `hidden`).
- **Deploy:** feature branch `feat/memberfolio-access-modal` → PR → squash-merge. Direct push to `main` is blocked.
- **Keep `docs/ARCHITECTURE.md` in sync** in the same branch (new component, new public asset, CSP change) and bump its "Last verified" date.
- **Leave the in-flight favicon/icon working-tree changes untouched** (do not stage them).

---

### Task 1: Modal interaction logic module (pure + jsdom-testable)

**Files:**
- Create: `src/components/memberfolio-modal-logic.ts`
- Test: `tests/components/memberfolio-modal-logic.test.ts`

**Interfaces:**
- Produces:
  - `PORTAL_URL: string` = `'https://app.isatucmpc.coop'`
  - `HOWTO_SRC: string` = `'/memberfolio-howto.html'`
  - `isPortalHref(href: string | null | undefined): boolean`
  - `selectTriggers(doc: Document, dialogId?: string): HTMLAnchorElement[]`
  - `createAccessModal(els: AccessModalEls, howtoSrc?: string): AccessModalController`
  - `interface AccessModalEls { dialog: HTMLDialogElement; gateway: HTMLElement; howto: HTMLElement; iframe: HTMLIFrameElement; }`
  - `interface AccessModalController { open(trigger?: HTMLElement | null): void; close(): void; showGateway(): void; showHowto(): void; handleClose(): void; lastTrigger: HTMLElement | null; }`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/components/memberfolio-modal-logic.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PORTAL_URL, HOWTO_SRC, isPortalHref, selectTriggers, createAccessModal,
} from '~/components/memberfolio-modal-logic';

describe('isPortalHref', () => {
  it('matches the exact portal URL', () => {
    expect(isPortalHref(PORTAL_URL)).toBe(true);
  });
  it('matches the portal URL with a trailing slash', () => {
    expect(isPortalHref(PORTAL_URL + '/')).toBe(true);
  });
  it('rejects other hrefs and empty values', () => {
    expect(isPortalHref('/membership')).toBe(false);
    expect(isPortalHref('https://example.com')).toBe(false);
    expect(isPortalHref(null)).toBe(false);
    expect(isPortalHref(undefined)).toBe(false);
  });
});

describe('selectTriggers', () => {
  it('returns portal links outside the dialog and excludes those inside it', () => {
    document.body.innerHTML = `
      <a id="hdr" href="${PORTAL_URL}">Member Login</a>
      <a id="ftr" href="${PORTAL_URL}">Member Login</a>
      <a id="other" href="/membership">Join</a>
      <dialog id="mfDialog">
        <a id="signin" href="${PORTAL_URL}">Sign in</a>
      </dialog>`;
    const ids = selectTriggers(document).map(a => a.id).sort();
    expect(ids).toEqual(['ftr', 'hdr']);
  });
});

describe('createAccessModal', () => {
  function build() {
    document.body.innerHTML = `
      <a id="trigger" href="${PORTAL_URL}">Member Login</a>
      <dialog id="mfDialog">
        <div id="gateway"></div>
        <div id="howto"><iframe id="frame" title="t"></iframe></div>
      </dialog>`;
    const dialog = document.getElementById('mfDialog') as HTMLDialogElement;
    return {
      ctrl: createAccessModal({
        dialog,
        gateway: document.getElementById('gateway') as HTMLElement,
        howto: document.getElementById('howto') as HTMLElement,
        iframe: document.getElementById('frame') as HTMLIFrameElement,
      }),
      dialog,
      iframe: document.getElementById('frame') as HTMLIFrameElement,
      trigger: document.getElementById('trigger') as HTMLAnchorElement,
    };
  }

  it('lazy-loads the iframe src only when the how-to view is shown', () => {
    const { ctrl, iframe } = build();
    expect(iframe.getAttribute('src')).toBe(null);
    ctrl.showHowto();
    expect(iframe.getAttribute('src')).toBe(HOWTO_SRC);
  });

  it('toggles view state classes between gateway and how-to', () => {
    const { ctrl } = build();
    ctrl.showHowto();
    expect(document.getElementById('gateway')!.classList.contains('is-hidden')).toBe(true);
    expect(document.getElementById('howto')!.classList.contains('is-active')).toBe(true);
    ctrl.showGateway();
    expect(document.getElementById('gateway')!.classList.contains('is-hidden')).toBe(false);
    expect(document.getElementById('howto')!.classList.contains('is-active')).toBe(false);
  });

  it('returns focus to the trigger and resets to gateway on close', () => {
    const { ctrl, trigger } = build();
    ctrl.open(trigger);
    ctrl.showHowto();
    ctrl.handleClose();
    expect(document.activeElement).toBe(trigger);
    expect(document.getElementById('howto')!.classList.contains('is-active')).toBe(false);
    expect(ctrl.lastTrigger).toBe(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/components/memberfolio-modal-logic.test.ts`
Expected: FAIL — cannot resolve `~/components/memberfolio-modal-logic`.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/memberfolio-modal-logic.ts
export const PORTAL_URL = 'https://app.isatucmpc.coop';
export const HOWTO_SRC = '/memberfolio-howto.html';

/** True when an href points at the MemberFolio portal (tolerates a trailing slash). */
export function isPortalHref(href: string | null | undefined): boolean {
  if (!href) return false;
  return href.replace(/\/+$/, '') === PORTAL_URL;
}

/** Portal "Member Login" links that should open the modal — excludes links inside the dialog. */
export function selectTriggers(doc: Document, dialogId = 'mfDialog'): HTMLAnchorElement[] {
  const all = Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  return all.filter(a => isPortalHref(a.getAttribute('href')) && !a.closest(`#${dialogId}`));
}

export interface AccessModalEls {
  dialog: HTMLDialogElement;
  gateway: HTMLElement;
  howto: HTMLElement;
  iframe: HTMLIFrameElement;
}

export interface AccessModalController {
  open(trigger?: HTMLElement | null): void;
  close(): void;
  showGateway(): void;
  showHowto(): void;
  handleClose(): void;
  lastTrigger: HTMLElement | null;
}

export function createAccessModal(els: AccessModalEls, howtoSrc = HOWTO_SRC): AccessModalController {
  let lastTrigger: HTMLElement | null = null;

  function showGateway(): void {
    els.gateway.classList.remove('is-hidden');
    els.howto.classList.remove('is-active');
  }
  function showHowto(): void {
    if (!els.iframe.getAttribute('src')) els.iframe.setAttribute('src', howtoSrc);
    els.gateway.classList.add('is-hidden');
    els.howto.classList.add('is-active');
  }
  function open(trigger: HTMLElement | null = null): void {
    lastTrigger = trigger;
    showGateway();
    if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
  }
  function close(): void {
    if (typeof els.dialog.close === 'function') els.dialog.close();
  }
  function handleClose(): void {
    showGateway();
    if (lastTrigger) lastTrigger.focus();
    lastTrigger = null;
  }

  return {
    open, close, showGateway, showHowto, handleClose,
    get lastTrigger() { return lastTrigger; },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/components/memberfolio-modal-logic.test.ts`
Expected: PASS (all 8 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/components/memberfolio-modal-logic.ts tests/components/memberfolio-modal-logic.test.ts
git commit -m "feat: MemberFolio access modal interaction logic + tests"
```

---

### Task 2: `MemberLoginModal.astro` component + mount in layout

**Files:**
- Create: `src/components/MemberLoginModal.astro`
- Modify: `src/layouts/PageLayout.astro` (add `<MemberLoginModal />` after `<Footer />`)

**Interfaces:**
- Consumes: `createAccessModal`, `selectTriggers`, `PORTAL_URL` from `~/components/memberfolio-modal-logic` (Task 1).
- Produces: a global `<dialog id="mfDialog">` with `#mf-gateway`, `#mf-howto`, `#mf-frame`, trigger interception, and gateway/how-to view switching. CSS classes `is-hidden` / `is-active` drive view state.

- [ ] **Step 1: Create the component**

Match the approved preview (`~/Downloads/memberfolio-modal-preview.html`) for markup/styles. Use brand utilities/tokens already in the project (`bg-navy`, `text-orange`, `font-display`, `font-body`, the gradient rule) where convenient; scoped `<style>` is fine for dialog-specific rules. The feature pills text MUST read exactly:
`Capital shares & dividends`, `Loans & balances`, `Loan calculator`, `Loan applications`, `Statements & certificates`, `Classifications`, `Welfare fund`, `Two-factor security`.

```astro
---
// src/components/MemberLoginModal.astro
import { PORTAL_URL } from '~/components/memberfolio-modal-logic';
const FEATURES = [
  'Capital shares & dividends', 'Loans & balances', 'Loan calculator', 'Loan applications',
  'Statements & certificates', 'Classifications', 'Welfare fund', 'Two-factor security',
];
---
<dialog id="mfDialog" class="mf-dialog" aria-labelledby="mfTitle">
  <div class="mf-head">
    <div>
      <h2 id="mfTitle">Access MemberFolio</h2>
      <p class="mf-sub">Already an ISATUCMPC member? Set up your online access to your capital shares, loans, statements and more &mdash; anytime.</p>
    </div>
    <button type="button" class="mf-x" aria-label="Close" data-mf-close>&times;</button>
  </div>
  <div class="mf-rule" aria-hidden="true"></div>

  <!-- Gateway view -->
  <div class="mf-gateway" id="mf-gateway">
    <div class="mf-features">
      <p class="mf-feat-title">Everything in one member portal</p>
      <ul class="mf-feat-grid">
        {FEATURES.map(f => <li>{f}</li>)}
      </ul>
    </div>
    <div class="mf-choices">
      <div class="mf-choice">
        <span class="mf-tag">Existing member</span>
        <h3>Sign in</h3>
        <p>Already have your online account? Go straight to the portal.</p>
        <a class="mf-btn" href={PORTAL_URL}>Sign in</a>
      </div>
      <div class="mf-choice mf-recommended">
        <span class="mf-tag">First time here</span>
        <h3>Sign up</h3>
        <p>New to MemberFolio? See how to create your online account.</p>
        <button type="button" class="mf-btn mf-btn-primary" id="mf-show-howto">Show me how &rarr;</button>
      </div>
    </div>
  </div>

  <!-- How-to view -->
  <div class="mf-howto" id="mf-howto">
    <div class="mf-bar">
      <button type="button" class="mf-back" id="mf-back">&larr; Back</button>
      <strong>How to create your account &amp; sign in</strong>
      <span style="width:3rem"></span>
    </div>
    <iframe id="mf-frame" title="MemberFolio how-to guide" loading="lazy"></iframe>
    <div class="mf-foot">
      <button type="button" class="mf-btn mf-btn-ghost" data-mf-close>Close</button>
      <a class="mf-btn mf-btn-primary" href={PORTAL_URL}>Continue to MemberFolio &rarr;</a>
    </div>
  </div>
</dialog>

<style>
  /* Port the preview's dialog/gateway/how-to CSS here, renaming the
     state classes to .is-hidden / .is-active and prefixing classes with mf-.
     Brand tokens come from src/styles/global.css custom properties. */
  .mf-gateway.is-hidden { display: none; }
  .mf-howto { display: none; }
  .mf-howto.is-active { display: flex; flex-direction: column; }
  /* ...remaining styles ported from the approved preview... */
</style>

<script>
  import { createAccessModal, selectTriggers } from '~/components/memberfolio-modal-logic';
  const dialog = document.getElementById('mfDialog') as HTMLDialogElement | null;
  if (dialog) {
    const ctrl = createAccessModal({
      dialog,
      gateway: document.getElementById('mf-gateway') as HTMLElement,
      howto: document.getElementById('mf-howto') as HTMLElement,
      iframe: document.getElementById('mf-frame') as HTMLIFrameElement,
    });

    // Intercept the "Member Login" links (outside the dialog).
    for (const a of selectTriggers(document)) {
      a.addEventListener('click', (e) => {
        if (typeof dialog.showModal !== 'function') return; // fail-safe: navigate
        e.preventDefault();
        // close the mobile menu if the trigger lives inside it
        const menu = document.getElementById('mobile-menu');
        const toggle = document.getElementById('mobile-menu-toggle');
        if (menu && !menu.classList.contains('hidden')) {
          menu.classList.add('hidden');
          toggle?.setAttribute('aria-expanded', 'false');
        }
        ctrl.open(a);
      });
    }

    document.getElementById('mf-show-howto')?.addEventListener('click', () => ctrl.showHowto());
    document.getElementById('mf-back')?.addEventListener('click', () => ctrl.showGateway());
    dialog.querySelectorAll('[data-mf-close]').forEach(b => b.addEventListener('click', () => ctrl.close()));
    dialog.addEventListener('close', () => ctrl.handleClose());
    // backdrop click closes (click lands on the dialog element itself)
    dialog.addEventListener('click', (e) => { if (e.target === dialog) ctrl.close(); });
  }
</script>
```

- [ ] **Step 2: Mount in `PageLayout.astro`**

```astro
---
import BaseLayout from '~/layouts/BaseLayout.astro';
import Header from '~/components/Header.astro';
import Footer from '~/components/Footer.astro';
import MemberLoginModal from '~/components/MemberLoginModal.astro';

interface Props { title: string; description: string; ogImage?: string; jsonLd?: Record<string, unknown>; noIndex?: boolean; }
const props = Astro.props;
---
<BaseLayout {...props}>
  <Header />
  <main id="main">
    <slot />
  </main>
  <Footer />
  <MemberLoginModal />
</BaseLayout>
```

- [ ] **Step 3: Type-check and build**

Run: `./node_modules/.bin/astro check`
Expected: 0 errors, 0 warnings.

Run: `./node_modules/.bin/astro build`
Expected: build succeeds. Confirm `dist/` pages contain `id="mfDialog"`:
Run: `grep -rl 'id="mfDialog"' dist | head`
Expected: at least `dist/index.html`.

- [ ] **Step 4: Re-run the unit suite (no regressions)**

Run: `pnpm test`
Expected: all tests pass (including Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/components/MemberLoginModal.astro src/layouts/PageLayout.astro
git commit -m "feat: MemberFolio access modal component, mounted globally"
```

---

### Task 3: Production how-to asset (copy + trim deck chrome)

**Files:**
- Create: `public/memberfolio-howto.html` (from `~/Downloads/memberfolio-howto_3.html`, which already has slide 14 removed and a 13-slide counter)

**Interfaces:**
- Consumes: nothing in-repo. Produces the same-origin asset the modal iframe loads at `/memberfolio-howto.html` (referenced by `HOWTO_SRC` in Task 1).

Rationale for hiding (not deleting) chrome: the deck's bundled JS references `#btnPlay`, `#btnNotes`, `#btnFull`, `#timerbar`, and `#notes` by id. Removing those elements would throw at runtime. Hiding them via injected CSS removes them from the member's view and tab order with zero risk to the script. Autoplay only starts on a `#btnPlay` click, which is now unreachable.

- [ ] **Step 1: Copy the file**

```bash
cp ~/Downloads/memberfolio-howto_3.html public/memberfolio-howto.html
```

- [ ] **Step 2: Inject the chrome-trim stylesheet**

Insert this block immediately before `</head>` in `public/memberfolio-howto.html`:

```html
<style>
  /* In-site embed: hide video/presenter chrome, keep Prev/Next + counter/progress */
  #btnPlay, #btnNotes, #btnFull, #timerbar, #notes { display: none !important; }
</style>
```

- [ ] **Step 3: Verify the asset**

Run: `grep -c 'id="btnPrev"\|id="btnNext"\|id="counter"' public/memberfolio-howto.html`
Expected: `3` (navigation + counter retained).

Run: `grep -c 'class="slide[ "]' public/memberfolio-howto.html`
Expected: `13` (slide 14 already removed).

Run: `grep -c 'Appendix — Storyboard\|For your video editor' public/memberfolio-howto.html`
Expected: `0`.

Run: `grep -c 'In-site embed: hide video/presenter chrome' public/memberfolio-howto.html`
Expected: `1` (the override is present).

- [ ] **Step 4: Build carries the asset through**

Run: `./node_modules/.bin/astro build`
Expected: succeeds; `test -f dist/memberfolio-howto.html && echo OK` prints `OK`.

- [ ] **Step 5: Commit**

```bash
git add public/memberfolio-howto.html
git commit -m "feat: add MemberFolio how-to asset (13 slides, trimmed chrome)"
```

---

### Task 4: CSP `frame-src` + architecture doc

**Files:**
- Modify: `public/_headers` (line 16 CSP — add `'self'` to `frame-src`)
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- Consumes: the asset and component from Tasks 2–3. Produces no code interface; unblocks the same-origin iframe and records the change.

- [ ] **Step 1: Update the CSP**

In `public/_headers`, change the `frame-src` directive from:
`frame-src https://challenges.cloudflare.com;`
to:
`frame-src 'self' https://challenges.cloudflare.com;`
Leave `frame-ancestors 'none'` and every other directive unchanged.

- [ ] **Step 2: Verify the edit**

Run: `grep -o "frame-src [^;]*;" public/_headers`
Expected: `frame-src 'self' https://challenges.cloudflare.com;`

- [ ] **Step 3: Update `docs/ARCHITECTURE.md`**

Add, in the appropriate existing sections:
- Components: `MemberLoginModal.astro` — global MemberFolio access pop-up (gateway + how-to iframe), mounted in `PageLayout.astro`; logic in `memberfolio-modal-logic.ts`.
- Public assets / structure: `public/memberfolio-howto.html` — embedded how-to deck (13 slides) loaded by the modal iframe. No new route added (modal is global).
- Security: `frame-src` now includes `'self'` to permit the same-origin how-to iframe.
- Bump the "Last verified against the codebase" date (line ~7) to `2026-06-20`.

- [ ] **Step 4: Commit**

```bash
git add public/_headers docs/ARCHITECTURE.md
git commit -m "chore: allow same-origin iframe in CSP; update architecture doc"
```

---

### Task 5: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Type-check**

Run: `./node_modules/.bin/astro check`
Expected: 0 errors / 0 warnings.

- [ ] **Step 2: Unit tests**

Run: `pnpm test`
Expected: all green (includes the Task 1 suite).

- [ ] **Step 3: Build**

Run: `./node_modules/.bin/astro build`
Expected: succeeds; `dist/memberfolio-howto.html` present; `dist/index.html` contains `id="mfDialog"`.

- [ ] **Step 4: Accessibility (pa11y)**

Run: `./node_modules/.bin/astro preview &` then `pnpm a11y` (or per repo README), then stop the preview server.
Expected: pa11y reports 0 errors for all 6 URLs. (The dialog is closed by default, so its open state is not auto-crawled — also do the manual check in Step 5.)

- [ ] **Step 5: Manual smoke test**

Run: `./node_modules/.bin/astro dev` and in the browser:
- Click **Member Login** (header desktop, mobile menu, footer) → gateway opens each time.
- Gateway shows the 8 feature pills (incl. "Loan applications", "Classifications").
- **Sign in** → navigates to `https://app.isatucmpc.coop`.
- **Sign up → "Show me how →"** → how-to iframe loads; deck pages 1→13 with Prev/Next; no Play/Notes/Fullscreen visible.
- **Back** returns to gateway; **× / ESC / click-outside / Close / Maybe later** all dismiss; focus returns to the trigger link.
- Mobile width → dialog is full-screen.
- Browser console shows no CSP errors when the iframe loads.

- [ ] **Step 6: Finalize**

Push the branch and open a PR per the repo workflow (`finishing-a-development-branch`). Do not stage the unrelated favicon/icon working-tree changes.

```bash
git push -u origin feat/memberfolio-access-modal
```

---

## Self-Review notes

- **Spec coverage:** trigger-on-click (T2) · gateway/sign-in/sign-up paths (T2) · whole how-to via iframe (T1 lazy src + T2 + T3) · slide 14 removed & 13-slide counter (T3) · trimmed deck chrome (T3) · reframed copy, no "join"/"savings" (T2 constants/markup) · feature strip incl. Loan applications & Classifications (T2 `FEATURES`) · native `<dialog>` + progressive enhancement (T1/T2) · `frame-src 'self'` CSP (T4) · ARCHITECTURE.md + Last verified bump (T4) · accessibility & focus return (T1 `handleClose`, T2 wiring, T5 pa11y) · out-of-scope items untouched.
- **Placeholder scan:** the component `<style>` block is intentionally summarized ("port from the approved preview") because the exact CSS is the approved preview file the implementer copies verbatim; all logic/markup/test code is concrete.
- **Type consistency:** `createAccessModal`, `selectTriggers`, `isPortalHref`, `AccessModalEls`, `AccessModalController`, `is-hidden`/`is-active`, element ids (`mfDialog`, `mf-gateway`, `mf-howto`, `mf-frame`) used identically across Tasks 1–2.
