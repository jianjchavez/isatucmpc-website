# ISATUCMPC Public Website

Public-facing website for the **Iloilo Science and Technology University and Community Multi-Purpose Cooperative (ISATUCMPC)**.

- **Live:** https://isatucmpc.pages.dev (custom domain `isatucmpc.coop` pending DotCoop `.coop` eligibility — see `docs/T27-DNS-CUTOVER.md`)
- **Stack:** Astro 6 + Tailwind 4 + MDX, deployed on Cloudflare Pages. Form submissions go to a Cloudflare Worker (`worker/`) + Resend, protected by Turnstile.
- **Deploy:** automatic on push to `main` via GitHub Actions → Cloudflare Pages.

> This is a **standalone git repo** nested under the CoopSuite pnpm workspace. It is **not** part of the monorepo and must be worked on with the flags below.

## Local development

Run everything from the repo root (`~/Code/CoopSuite/Website`):

```sh
# install deps (the flags matter — see Gotchas)
pnpm install --ignore-workspace --ignore-scripts

# local dev server with hot reload  → http://localhost:4321
./node_modules/.bin/astro dev

# type-check + production build → ./dist/
./node_modules/.bin/astro check
./node_modules/.bin/astro build

# serve the built ./dist/ locally (what deploys) → http://localhost:4321
./node_modules/.bin/astro preview
```

## ⚠️ Gotchas (read before installing or running tools)

1. **Always use the install flags:** `pnpm install --ignore-workspace --ignore-scripts`.
   This repo is nested inside the monorepo's pnpm workspace; without `--ignore-workspace`
   pnpm tries to resolve workspace siblings, and pnpm v11's strict-builds policy turns
   ignored postinstalls into a hard error without `--ignore-scripts`.
2. **Run binaries via `./node_modules/.bin/<tool>`** (e.g. `./node_modules/.bin/astro`,
   `./node_modules/.bin/wrangler`). `pnpm dlx` / `pnpm exec` silently fail to compile
   esbuild/workerd under pnpm v11 and exit without running.
3. **No `timeout` on macOS** — don't wrap verification commands in `timeout`; they no-op.

## Project structure

```text
src/
├── pages/          # routes (index, about, services, membership, contact, news/…)
├── components/     # Astro components (Header, Footer, ContactMap, forms, cards…)
├── data/           # content data (services, board, faq, timeline, goals, principles, stats)
├── content/news/   # MDX news/announcement articles (content collection)
├── layouts/        # BaseLayout, PageLayout
└── lib/            # pdf-fill (membership PDF generation), seo, brand
worker/             # Cloudflare Worker handling form submissions (Resend + Turnstile)
public/             # static assets, downloadable PDF forms, icons
docs/               # operational runbooks (e.g. T27 DNS cutover)
```

## Deploy

Push to `main` → GitHub Actions builds and deploys to Cloudflare Pages automatically.
For the custom-domain (`isatucmpc.coop`) cutover, follow `docs/T27-DNS-CUTOVER.md`.
