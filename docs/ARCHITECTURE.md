# ISATUCMPC Website — Architecture & Technical Specification

> **⚠️ Keep this current.** This document is the single source of truth for the
> site's architecture. Whenever you change the stack, hosting, build/deploy,
> site structure, components/data, integrations, or security configuration,
> **update the relevant section here in the same change** (see `CLAUDE.md`).
> Last verified against the codebase: 2026-10-21.

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
- **QR codes:** `qrcode` 1.5.4 (build-time, vector website QR on PMES print documents; `@types/qrcode` dev)
- **SEO/feeds:** `astro-seo`, `@astrojs/sitemap`, `@astrojs/rss`
- **Path alias:** `~` → `src/` (configured in `astro.config.mjs`)
- **`astro.config.mjs`:** `site: 'https://isatucmpc.coop'`; sitemap filters out `/404` and `/pmes/*` (all five PMES pages are `noindex`); `inlineStylesheets: 'auto'`.

## 4. Forms + PMES backend (Cloudflare Worker)

- **Location:** `worker/` (own `package.json` + `wrangler.toml` + `migrations/` + `scripts/` + tests)
- **Runtime:** Cloudflare Worker `isatucmpc-forms`, **Hono** router, TypeScript. One Worker, two route groups.
- **Forms endpoint:** `POST /api/submit` with `hono/cors` middleware (CORS preflight handled — see lessons in commit history)
- **PMES route group `/api/pmes/*`** (spec `docs/superpowers/specs/2026-10-21-pmes-quiz-design.md` §5; same CORS allowlist; errors are `{ error: "<kebab-code>" }`):
  - attendee `POST start` (Turnstile + rate limit; validates the session code and attempt count, draws 20 questions server-side, returns them **without** answers) and `POST submit` (scores server-side; issues the certificate on a pass; sends the result emails)
  - `GET certificate?no=&key=` (full record, needs the per-certificate key) and `GET verify?no=` (public subset, no contact details)
  - admin `POST admin/login` / `admin/logout`, `GET|POST admin/sessions`, `POST admin/sessions/:id/close`, `POST admin/sessions/:id/override`, `GET admin/sessions/:id/roster` and `roster.csv` — guarded by the `pmes_admin` cookie (HMAC-SHA256 signed with `PMES_SESSION_SECRET`, 12-hour expiry, `HttpOnly; Secure; SameSite=None` because the site calls the Worker cross-site with credentials; CSRF is blocked by the Origin allowlist on every POST)
  - modules in `worker/src/pmes/`: `bank.ts` (imports `src/data/pmes-questions.json` from the site, filtered by status), `draw.ts`, `score.ts`, `sessions.ts` (code `PMES-XXXX`, valid on its Asia/Manila day), `auth.ts` (PBKDF2-SHA256 passwords, cookie signing, `requirePresenter` middleware), `certificates.ts` (`PMES-YYYY-NNNN` from `pmes_counters`), `email.ts`, `env.ts`
- **Shared:** `worker/src/resend.ts` (`resend()` + `escapeHtml()`) and `worker/src/turnstile.ts` (`verifyTurnstile()`), both extracted from `index.ts` and used by both route groups
- **Config (`worker/wrangler.toml`):** `compatibility_date 2026-05-27`; vars `SITE_ORIGIN` (comma-separated allowlist: `https://isatucmpc.coop,https://isatucmpc.pages.dev`), `TO_EMAIL=isatucmpc1964@gmail.com`, `PMES_DRAW_STATUS` (`approved`; `draft` for rehearsals), `PMES_PASS_MARK=16`, `PMES_QUIZ_SIZE=20`, `PMES_MAX_ATTEMPTS=3`, `SITE_URL=https://isatucmpc.coop`
- **Bindings:** D1 `PMES_DB` → database `isatucmpc-pmes` (`migrations_dir = "migrations"`, schema `migrations/0001_pmes.sql`: `pmes_presenters`, `pmes_sessions`, `pmes_attempts`, `pmes_certificates`, `pmes_counters`, `pmes_overrides`); rate limit `PMES_RL` (`[[ratelimits]]`, 10 per IP per 60 s window — the binding only offers 10 s / 60 s periods, so the spec's 10-per-10-minutes budget is backed by the attempt limit)
- **Secrets (via `wrangler secret put`):** `RESEND_API_KEY`, `TURNSTILE_SECRET`, `PMES_SESSION_SECRET`
- **Presenter seeding:** `worker/scripts/seed-presenter.mjs "<Full Name>"` prompts for a password (hidden) and prints the `wrangler d1 execute` line; no self-registration. Owner-run deploy steps: `worker/README-pmes.md`.
- **Tests:** Vitest + `@cloudflare/vitest-pool-workers` (`worker/vitest.config.ts` reads `migrations/` via `readD1Migrations`; `tests/setup.ts` applies them to an isolated `PMES_DB` per test file; `tests/env.d.ts` types `cloudflare:test` env through `Cloudflare.Env`). Covers CORS preflight, codes and Manila-day validity, draw composition, scoring, certificate numbering, auth, emails.
- **Flow (forms):** browser → `public/forms.js` (JSON `POST`) → Turnstile verification → Resend send → notification email to coop **+** auto-acknowledgement to submitter
- **Flow (PMES):** `/pmes/` page → `start` → quiz → `submit` → result on page + result email to the attendee and a copy (with contact details and attempt number, `reply_to` the attendee) to `TO_EMAIL`; a pass gets a certificate link `/pmes/certificate/?no=&key=`

## 5. Repository, tooling & build

- **Node:** `>=22.12` (CI runs Node **24**). **pnpm 11.0.4** (`packageManager`).
- **Build output:** **15** static pages → `dist/`.
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
/privacy           src/pages/privacy.astro        RA 10173 privacy notice (DPO contact, form data flows, member rights)
/news/             src/pages/news/index.astro     News listing
/news/[...slug]    src/pages/news/[...slug].astro  MDX article pages
/news/rss.xml      src/pages/news/rss.xml.ts       RSS feed
/404               src/pages/404.astro
/pmes/             src/pages/pmes/index.astro             PMES quiz: identity form, session code, 20 questions, result (noindex)
/pmes/certificate/ src/pages/pmes/certificate.astro       Certificate of Completion by ?no=&key=, A4 print, Tier 0 letterhead (noindex)
/pmes/verify/      src/pages/pmes/verify.astro            Public certificate check by ?no= (noindex)
/pmes/admin/       src/pages/pmes/admin/index.astro       Presenter sign-in, sessions, create, roster, override, close, CSV (noindex)
/pmes/admin/results-sheet/  src/pages/pmes/admin/results-sheet.astro  Session Results Sheet, A4 print, Tier 1 letterhead (noindex)
```

The five `/pmes/` pages are static shells; all data comes from the Worker (`/api/pmes/*`). They are `noindex` and excluded from the sitemap.

**Public assets (non-page):** `public/memberfolio-howto.html` — embedded how-to slide deck (13 slides) served as a static asset and loaded inside the `MemberLoginModal` iframe. It is not a routed page; the modal is mounted globally in `PageLayout.astro`.

## 7. Components, layouts & data

- **Layouts:** `BaseLayout.astro` (head, SEO tags, Turnstile explicit-render loader), `PageLayout.astro`.
- **Components (`src/components/`):** Header, Footer, Button, Eyebrow, GradientOrb, ServiceCard, BenefitCard, BodCard, NewsCard, Timeline, HistoryNarrative, MembershipProcess, MembershipForm, ContactForm, ContactMap, EligibilityCheck, FaqAccordion, CoopMarque (+ `eligibility-logic.ts`), `MemberLoginModal.astro` (global MemberFolio access pop-up — gateway link + how-to iframe — mounted in `PageLayout.astro`; interaction logic in `memberfolio-modal-logic.ts`).
- **PMES components:** `PmesLetterhead.astro` (`tier="full"` Tier 0 with seal for the certificate, `tier="lean"` Tier 1 for the results sheet; org name only from `~/lib/letterhead`), `PmesDocFooter.astro` (website QR 12 mm bottom-right, verify URL, `Page X of Y`, signature validity line), `pmes-qr.ts` (build-time navy vector QR via `qrcode`), `pmes-logic.ts` (API shapes, answer state, timer, progress, error messages; tested in `tests/pmes-logic.test.ts`), `pmes-admin-logic.ts` (roster totals, CSV, Manila date helpers; tested in `tests/pmes-admin-logic.test.ts`).
- **Co-operative Marque (`CoopMarque.astro` + `public/coop-marque/`):** the official ICA Co-operative Marque, used as an *alignment device* per the ICA marque guidelines (no dependency added; PNG masters served statically). `CoopMarque.astro` is the **single compliant chokepoint** — it picks the correct unaltered master file by `variant` (marque / slogan / message) and `color`, prevents distortion (`object-contain`, derived height), reserves the exclusion-zone clear space, and emits alt text. Placed in the footer (white slogan lockup on navy), home trust strip + About affiliations (orange marque on light), and a light identity band after the About principles section (black key-message 1, "People together are stronger"). Light-bg colour = orange/black; dark/navy = white/reversed. (Note: the ICA `English_key_messages` zip ships a mislabeled `coop_white_message1_en.png` — it is actually the spring-green artwork, not white — so message 1 is used in black on a light background. Messages 2–7 white masters are correct.) **Never** recolor, stretch, box, or use plum. Design spec: `docs/superpowers/specs/2026-06-08-coop-marque-website-design.md`.
- **Data (`src/data/`, typed TS):** `services` (10), `benefits`, `board`, `faq`, `goals` (9), `principles` (7), `stats`, `timeline`. `stats` and `timeline` auto-compute from the 1964 founding year.
- **PMES question bank (`src/data/pmes-questions.json`):** 10 sections, 63 questions, each with four options, the correct index, the deck slide and a `status` (`draft` → `approved` by the committee). The Worker bundles this same file (`worker/src/pmes/bank.ts`); `tests/pmes-questions.test.ts` enforces ≥4 questions per section. Correct answers never ship to the browser: the site build does not render them, and the Worker strips them before returning a draw.
- **Content collection:** `src/content/news/` (MDX articles).
- **Lib (`src/lib/`):** `brand.ts` (color/font tokens), `pdf-fill.ts` (PDF coordinate maps for Regular + Associate forms), `seo.ts` (schema.org Organization + LocalBusiness builders), `letterhead.ts` (organization identity strings copied from the `isatucmpc-letterhead` skill — two-line uppercase name, address, CDA/CIN/TIN, signature captions; never retype the name).

## 8. Design system

- **Colors:** navy `#010066`, orange `#FE9900`, gold `#FFC001`, red `#FF3F00`, blue `#0102FD`, green `#23CD63`; ink `#111827`, slate `#6B7280`, rule `#E8E8E8`, background `#F5F5F5`.
- **Brand gradient:** navy → orange → gold (3px `.brand-rule`).
- **Typography:** Montserrat headings (weights 800/700/600), Open Sans body; tight heading letter-spacing.
- **Accessibility:** orange `focus-visible` outline, semantic headings, pa11y CI.
- Tokens are defined twice for parity: Tailwind `@theme` (utilities) and `:root` CSS vars (raw use). Keep both in sync with `src/lib/brand.ts`.

## 9. Key features

- **Membership applications:** client-side eligibility check (`EligibilityCheck` + `eligibility-logic.ts`) and in-browser PDF form-fill (`pdf-lib`) for **Regular** and **Associate** forms (templates in `public/forms/`).
- **Forms email pipeline:** Turnstile (explicit-render, with `localhost` test-key fallback) → Worker → Resend; dual email (notification + auto-ack).
- **PMES certification quiz (`/pmes/*` + Worker `/api/pmes/*` + D1):** after the Pre-Membership Education Seminar an attendee enters identity (application or member number, name, mobile, email, consent), the presenter's session code (`PMES-XXXX`, valid only on its Asia/Manila date or until closed) and Turnstile, then answers 20 questions (2 per section, drawn and shuffled server-side, 20-minute timer by default). Pass mark 16/20; 3 attempts per identity per session, plus 3 more per presenter override with a reason. A pass issues certificate `PMES-YYYY-NNNN` (atomic counter per year) with a per-certificate key for the print page; `/pmes/verify/?no=` is the public check with no contact details. Results go to the page and by email to the attendee and the coop inbox. Presenters sign in by full name + password (PBKDF2, HMAC cookie) at `/pmes/admin/`, run sessions and print the Session Results Sheet. Spec: `docs/superpowers/specs/2026-10-21-pmes-quiz-design.md`.
- **News/blog:** MDX content collection + RSS feed.
- **SEO:** Organization + LocalBusiness schema.org JSON-LD, sitemap, OG image (`og-default.svg`).
- **Favicon set (coop seal):** `favicon.ico`, `favicon-16/32.png`, `apple-touch-icon.png`, `android-chrome-192/512.png`, `site.webmanifest` (theme `#010066`).
- **`.coop` verified credential:** shown in footer (site-wide), About affiliations card, and home trust-strip badge. Currently text; **TODO** in those files to swap in the official COOP Marque image once DotCoop sends it (requested via identity.coop/claim-your-marque).

## 10. Security headers (`public/_headers`)

Applied to every route by Cloudflare Pages:

- **Content-Security-Policy** — `default-src 'self'`; scripts allow `'unsafe-inline'` + `challenges.cloudflare.com` (Turnstile) + `static.cloudflareinsights.com`; styles allow `'unsafe-inline'` + `unpkg.com` (Leaflet); img allows OpenStreetMap tiles + unpkg + `data:`; connect allows the forms Worker (also serves `/api/pmes/*`; the presenter pages call it with `credentials: 'include'`, no new host) + Turnstile + CF Insights; `frame-src` allows `'self'` (same-origin how-to iframe in `MemberLoginModal`) + `challenges.cloudflare.com` (Turnstile widget); `frame-ancestors 'none'`; `form-action 'self'` + forms Worker; `object-src 'none'`; `upgrade-insecure-requests`.
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

Cloudflare (Pages, Workers, D1 `isatucmpc-pmes`, Workers rate limiting, DNS, Turnstile) · Resend (email) · Gandi (registrar + inbound MX) · DotCoop / identity.coop (`.coop` verification + pending COOP Marque) · GitHub (repo + Actions) · OpenStreetMap (map tiles) · Facebook (`facebook.com/isatu.cmpc`).

## 13. Open follow-ups

- **COOP Marque image** — swap into the 3 `.coop`-credential spots once DotCoop sends the asset.
- **T28** — Facebook launch post + update FB Page "Website" field `pages.dev` → `isatucmpc.coop` (BOD-gated).
- **DMARC** — tighten `_dmarc` from `p=none` → `p=quarantine` ~30 days after clean traffic.
