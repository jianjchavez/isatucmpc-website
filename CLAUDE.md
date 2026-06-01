# CLAUDE.md — ISATUCMPC Website

Guidance for Claude (and any AI agent) working in this repository.

## Keep the architecture doc in sync — REQUIRED

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) is the single source of truth for
this site's architecture. **Whenever you make a change that affects any of the
following, update `docs/ARCHITECTURE.md` in the same change (same branch/PR):**

- Stack or dependencies (Astro, Tailwind, Worker/Hono, libraries, versions)
- Hosting / infrastructure (Cloudflare Pages, DNS, Worker, Resend, Turnstile, Gandi)
- Build, tooling, or CI/CD (`package.json` scripts, `astro.config.mjs`, GitHub Actions)
- Site structure (pages added/removed/renamed) or the page count
- Components, `src/data/*`, content collections, or layouts
- Integrations / external services
- Security configuration (`public/_headers`, CSP)
- Design tokens (`src/lib/brand.ts`, `src/styles/global.css`)

After updating, bump the "Last verified" date at the top of `ARCHITECTURE.md`.
If a change does **not** touch architecture (copy edits, content, bug fixes with
no structural impact), you don't need to touch the doc — use judgment.

## Project facts

- **Standalone repo** at `~/Code/CoopSuite/Website` — nested under, but **excluded
  from**, the CoopSuite pnpm workspace. It has its own git history and deploy.
- **Deploys to production on merge to `main`** (GitHub Actions → Cloudflare Pages).
  Use a feature branch → PR → squash-merge → delete branch. Direct push to `main`
  is blocked; use `gh pr merge`.
- **pnpm v11 gotcha:** run installs with `--ignore-workspace --ignore-scripts`, and
  invoke `astro`/`wrangler` via `./node_modules/.bin/` (pnpm's strict-build policy
  otherwise silently exits to shell).
- **Verify before claiming done:** `./node_modules/.bin/astro check` (0 errors /
  0 warnings) + `./node_modules/.bin/astro build`, and confirm rendered output in
  `dist/`.
- **Shared checkout:** other sessions may use this same working directory. Before
  switching branches or writing, re-check `git status` / branch / running servers
  to avoid clobbering a parallel session.
