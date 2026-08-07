# ISATUCMPC Website — Architecture & Technical Specification

> **⚠️ Keep this current.** This document is the single source of truth for the
> site's architecture. Whenever you change the stack, hosting, build/deploy,
> site structure, components/data, integrations, or security configuration,
> **update the relevant section here in the same change** (see `CLAUDE.md`).
> Last verified against the codebase: 2026-06-20.

---

## 1. Identity & purpose

- **Organization:** Iloilo Science and Technology University (ISAT U) and Community Multi-Purpose Cooperative — **ISATUCMPC**. Founded 1964. CDA Reg. No. `9520-06008210`.
- **Type:** Static marketing/informational website + a serverless backend for form submissions.
- **Live URLs:** `https://isatucmpc.coop` and `https://www.isatucmpc.coop` (primary). `https://isatucmpc.pages.dev` (Cloudflare Pages origin, also live).
- **Repository:** `github.com/jianjchavez/isatucmpc-website`. Local: `~/Code/CoopSuite/Website` — a **standalone git repo** nested under, but **excluded from**, the CoopSuite pnpm workspace.

## 2. Hosting & infrastructure

| Layer | Service / detail |
|---|---|
| Site hosting | Cloudflare Pages (project `isatucmpc`, proxied) |
| DNS | Cloudflare (nameservers `darwin`/`luciana.ns.cloudflare.com`) |
| Registrar | Gandi |
| Form backend | Cloudflare Worker `isatucmpc-forms` (`isatucmpc-forms.jianjchavez.workers.dev`) |
| Email delivery | Resend (region Tokyo `ap-northeast-1`; sender `noreply@isatucmpc.coop`) |
| Bot protection | Cloudflare Turnstile (Managed mode) |
| Inbound mail | Gandi MX (`spool.mail.gandi.net` / `fb.mail.gandi.net`) |
| TLS | Cloudflare-managed (Google Trust Services certificates) |
| Cloudflare account | personal (`jianjchavez@gmail.com`, acct ID `2ef7540f84fa35081c572c223734e8db`); coop Gmail is a Super Admin member |

DNS cutover (Gandi → Cloudflare) completed 2026-06-02 — see `docs/T27-DNS-CUTOVER.md`.

## 3. Frontend stack

- **Framework:** Astro **6.3.8** (static output) + MDX (`@astrojs/mdx`)
- **Styling:** Tailwind CSS **4.3** via `@tailwindcss/vite` — CSS-first `@theme` config in `src/styles/global.css` (no `tailwind.config.js`)
- **Fonts:** Montserrat (display) + Open Sans (body), self-hosted via `@fontsource`
- **Icons:** `lucide-astro`
- **Map:** Leaflet 1.9.4 (contact page; tiles from OpenStreetMap, CSS/markers from unpkg)
- **PDF generation:** `pdf-lib` (client-side application-form filling)
- **SEO/feeds:** `astro-seo`, `@astrojs/sitemap`, `@astrojs/rss`
- **Path alias:** `~` → `src/` (configured in `astro.config.mjs`)
- **`astro.config.mjs`:** `site: 'https://isatucmpc.coop'`; sitemap filters out `/404`; `inlineStylesheets: 'auto'`.

## 4. Forms backend (Cloudflare Worker)

- **Location:** `worker/` (own `package.json` + `wrangler.toml` + tests)
- **Runtime:** Cloudflare Worker, **Hono** router, TypeScript
- **Endpoint:** `POST /api/submit` with `hono/cors` middleware (CORS preflight handled — see lessons in commit history)
- **Config (`worker/wrangler.toml`):** `compatibility_date 2026-05-27`; vars `SITE_ORIGIN` (comma-separated allowlist: `https://isatucmpc.coop,https://isatucmpc.pages.dev`), `TO_EMAIL=isatucmpc1964@gmail.com`
- **Secrets (via `wrangler secret put`):** `RESEND_API_KEY`, `TURNSTILE_SECRET`
- **Tests:** Vitest + `@cloudflare/vitest-pool-workers` (includes CORS-preflight regression coverage)
- **Flow:** browser → `public/forms.js` (JSON `POST`) → Turnstile verification → Resend send → notification email to coop **+** auto-acknowledgement to submitter

## 5. Repository, tooling & build

- **Node:** `>=22.12` (CI runs Node **24**). **pnpm 11.0.4** (`packageManager`).
- **Build output:** **10** static pages → `dist/`.
- **Scripts:** `dev`, `build`, `preview`, `check` (astro check), `test` (vitest), `lint` (eslint), `format` (prettier), `a11y` (pa11y-ci).
- **Quality gates:** `astro check` (target 0 errors / 0 warnings), ESLint 10 + `eslint-plugin-astro`, Prettier, pa11y-ci accessibility (`.pa11yci.json`).
- ⚠️ **pnpm v11 gotcha:** installs need `--ignore-workspace --ignore-scripts`; invoke binaries via `./node_modules/.bin/` (astro, wrangler) because pnpm's strict-build policy otherwise silently exits. See `[[reference_pnpm_v11_ci_workaround]]`.

## 6. Site structure (pages)

```
/                  src/pages/index.astro          Home: hero, trust strip (+ .coop badge), services snapshot
/about             src/pages/about.astro          History, vision/mission, 9 goals, 7 ICA principles, BOD, affiliations
/services          src/pages/services.astro       Service catalog (10 services)
/membership        src/pages/membership.astro     Eligibility check + Regular/Associate application forms
/contact           src/pages/contact.astro        Contact form + Leaflet map
/news/             src/pages/news/index.astro     News listing
/news/[...slug]    src/pages/news/[...slug].astro  MDX article pages
/news/rss.xml      src/pages/news/rss.xml.ts       RSS feed
/404               src/pages/404.astro
```

**Public assets (non-page):** `public/memberfolio-howto.html` — embedded how-to slide deck (13 slides) served as a static asset and loaded inside the `MemberLoginModal` iframe. It is not a routed page; the modal is mounted globally in `PageLayout.astro`.

## 7. Components, layouts & data

- **Layouts:** `BaseLayout.astro` (head, SEO tags, Turnstile explicit-render loader), `PageLayout.astro`.
- **Components (`src/components/`):** Header, Footer, Button, Eyebrow, GradientOrb, ServiceCard, BenefitCard, BodCard, NewsCard, Timeline, HistoryNarrative, MembershipProcess, MembershipForm, ContactForm, ContactMap, EligibilityCheck, FaqAccordion, CoopMarque (+ `eligibility-logic.ts`), `MemberLoginModal.astro` (global MemberFolio access pop-up — gateway link + how-to iframe — mounted in `PageLayout.astro`; interaction logic in `memberfolio-modal-logic.ts`).
- **Co-operative Marque (`CoopMarque.astro` + `public/coop-marque/`):** the official ICA Co-operative Marque, used as an *alignment device* per the ICA marque guidelines (no dependency added; PNG masters served statically). `CoopMarque.astro` is the **single compliant chokepoint** — it picks the correct unaltered master file by `variant` (marque / slogan / message) and `color`, prevents distortion (`object-contain`, derived height), reserves the exclusion-zone clear space, and emits alt text. Placed in the footer (white slogan lockup on navy), home trust strip + About affiliations (orange marque on light), and a light identity band after the About principles section (black key-message 1, "People together are stronger"). Light-bg colour = orange/black; dark/navy = white/reversed. (Note: the ICA `English_key_messages` zip ships a mislabeled `coop_white_message1_en.png` — it is actually the spring-green artwork, not white — so message 1 is used in black on a light background. Messages 2–7 white masters are correct.) **Never** recolor, stretch, box, or use plum. Design spec: `docs/superpowers/specs/2026-06-08-coop-marque-website-design.md`.
- **Data (`src/data/`, typed TS):** `services` (10), `benefits`, `board`, `faq`, `goals` (9), `principles` (7), `stats`, `timeline`. `stats` and `timeline` auto-compute from the 1964 founding year.
- **Content collection:** `src/content/news/` (MDX articles).
- **Lib (`src/lib/`):** `brand.ts` (color/font tokens), `pdf-fill.ts` (PDF coordinate maps for Regular + Associate forms), `seo.ts` (schema.org Organization + LocalBusiness builders).

## 8. Design system

- **Colors:** navy `#010066`, orange `#FE9900`, gold `#FFC001`, red `#FF3F00`, blue `#0102FD`, green `#23CD63`; ink `#111827`, slate `#6B7280`, rule `#E8E8E8`, background `#F5F5F5`.
- **Brand gradient:** navy → orange → gold (3px `.brand-rule`).
- **Typography:** Montserrat headings (weights 800/700/600), Open Sans body; tight heading letter-spacing.
- **Accessibility:** orange `focus-visible` outline, semantic headings, pa11y CI.
- Tokens are defined twice for parity: Tailwind `@theme` (utilities) and `:root` CSS vars (raw use). Keep both in sync with `src/lib/brand.ts`.

## 9. Key features

- **Membership applications:** client-side eligibility check (`EligibilityCheck` + `eligibility-logic.ts`) and in-browser PDF form-fill (`pdf-lib`) for **Regular** and **Associate** forms (templates in `public/forms/`).
- **Forms email pipeline:** Turnstile (explicit-render, with `localhost` test-key fallback) → Worker → Resend; dual email (notification + auto-ack).
- **News/blog:** MDX content collection + RSS feed.
- **SEO:** Organization + LocalBusiness schema.org JSON-LD, sitemap, OG image (`og-default.svg`).
- **Favicon set (coop seal):** `favicon.ico`, `favicon-16/32.png`, `apple-touch-icon.png`, `android-chrome-192/512.png`, `site.webmanifest` (theme `#010066`).
- **`.coop` verified credential:** shown in footer (site-wide), About affiliations card, and home trust-strip badge. Currently text; **TODO** in those files to swap in the official COOP Marque image once DotCoop sends it (requested via identity.coop/claim-your-marque).

## 10. Security headers (`public/_headers`)

Applied to every route by Cloudflare Pages:

- **Content-Security-Policy** — `default-src 'self'`; scripts allow `'unsafe-inline'` + `challenges.cloudflare.com` (Turnstile) + `static.cloudflareinsights.com`; styles allow `'unsafe-inline'` + `unpkg.com` (Leaflet); img allows OpenStreetMap tiles + unpkg + `data:`; connect allows the forms Worker + Turnstile + CF Insights; `frame-src` allows `'self'` (same-origin how-to iframe in `MemberLoginModal`) + `challenges.cloudflare.com` (Turnstile widget); `frame-ancestors 'none'`; `form-action 'self'` + forms Worker; `object-src 'none'`; `upgrade-insecure-requests`.
- **Strict-Transport-Security** `max-age=31536000`
- **X-Frame-Options** `DENY`, **X-Content-Type-Options** `nosniff`
- **Referrer-Policy** `strict-origin-when-cross-origin`
- **Permissions-Policy** disables camera/mic/geolocation/payment/usb/interest-cohort
- **Cross-Origin-Opener-Policy** `same-origin`

> When adding any third-party (font CDN, video embed, analytics), extend the matching CSP directive in `public/_headers`.

## 11. CI/CD

- **Workflow:** `.github/workflows/` — triggers on push to `main` + manual `workflow_dispatch`. Concurrency group cancels in-progress deploys per ref.
- **Steps:** `actions/checkout@v6` → `pnpm/action-setup@v6` → `actions/setup-node@v6` (Node 24, pnpm cache) → `pnpm install --frozen-lockfile --ignore-scripts` → `pnpm build` → `npx wrangler@latest pages deploy dist --project-name=isatucmpc --branch=main`.
- **Auth:** secret `CLOUDFLARE_API_TOKEN` + var `CLOUDFLARE_ACCOUNT_ID`.
- **Branching convention:** feature branch → PR → squash-merge to `main` (auto-deploys to production) → delete branch. Direct push to `main` is blocked; use `gh pr merge`.

## 12. External services

Cloudflare (Pages, Workers, DNS, Turnstile) · Resend (email) · Gandi (registrar + inbound MX) · DotCoop / identity.coop (`.coop` verification + pending COOP Marque) · GitHub (repo + Actions) · OpenStreetMap (map tiles) · Facebook (`facebook.com/isatu.cmpc`).

## 13. Open follow-ups

- **COOP Marque image** — swap into the 3 `.coop`-credential spots once DotCoop sends the asset.
- **T28** — Facebook launch post + update FB Page "Website" field `pages.dev` → `isatucmpc.coop` (BOD-gated).
- **DMARC** — tighten `_dmarc` from `p=none` → `p=quarantine` ~30 days after clean traffic.
