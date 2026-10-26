# PMES quiz — Worker deploy notes (owner-run)

Design: `docs/superpowers/specs/2026-10-21-pmes-quiz-design.md`. Plan: `docs/superpowers/plans/2026-10-21-pmes-quiz.md` (Tasks 14-15).

The quiz API lives in the existing `isatucmpc-forms` Worker (`/api/pmes/*`). It needs one D1 database, one
secret and the vars already in `wrangler.toml`. Every command below runs on the **Mac**, in a Terminal,
from this directory (`cd ~/Code/CoopSuite/Website/worker`). Never paste a secret or a password into a chat.

## 1. Create the D1 database (once)

**Mac Terminal, inside `worker/`**

```sh
./node_modules/.bin/wrangler d1 create isatucmpc-pmes
```

Copy the `database_id` it prints into `wrangler.toml`, replacing `TODO-after-wrangler-d1-create` under
`[[d1_databases]]`. Commit that change (it is not a secret).

## 2. Apply the schema

**Mac Terminal, inside `worker/`**

```sh
./node_modules/.bin/wrangler d1 migrations apply isatucmpc-pmes --remote
```

Migrations are in `worker/migrations/` (`0001_pmes.sql`). Re-running is safe: applied files are skipped.

## 3. Set the cookie-signing secret (once)

**Mac Terminal, inside `worker/`**

```sh
openssl rand -hex 32 | ./node_modules/.bin/wrangler secret put PMES_SESSION_SECRET
```

`PMES_SESSION_SECRET` signs the presenter cookie (`pmes_admin`, 12-hour expiry). Rotating it signs every
presenter out; nothing else depends on it. `RESEND_API_KEY` and `TURNSTILE_SECRET` are already set for the
contact forms and are reused.

## 4. Seed the presenters

Presenters sign in with their **full name** as the committee lists it (compared case-insensitively) and a
password; there is no self-registration. For each name on the committee's list:

**Mac Terminal, inside `worker/`**

```sh
node scripts/seed-presenter.mjs "<Full Name>"
```

The script prompts for the password (typing is hidden; at least 8 characters), hashes it (PBKDF2-SHA256,
100,000 iterations) and prints one `wrangler d1 execute isatucmpc-pmes --remote --command "..."` line. Run
that printed line as-is in the same Terminal. Hand each presenter their password in person, not by chat or
email. To disable a presenter later, set `active = 0` on their row with `wrangler d1 execute`.

## 5. Draft bank on preview, approved bank on production

`PMES_DRAW_STATUS` decides which questions the Worker draws: `approved` (production default, set in
`wrangler.toml`) or `draft` (rehearsals before the committee has approved the bank).

- For a rehearsal, override it on a normal deploy and redeploy plainly afterwards:

  **Mac Terminal, inside `worker/`**

  ```sh
  ./node_modules/.bin/wrangler deploy --var PMES_DRAW_STATUS:draft   # rehearsal
  ./node_modules/.bin/wrangler deploy                                 # back to approved
  ```

- A standing preview Worker is possible with a wrangler `[env.preview]` block, but wrangler does not
  inherit `vars`, `d1_databases` or `ratelimits` into named environments: the block must repeat every var
  and binding, the preview Worker (`isatucmpc-forms-preview`) needs its own D1 id, secret and presenter
  rows, and its origin must be added to the site's CSP `connect-src` in `public/_headers`. Not set up.

Production must end up with `PMES_DRAW_STATUS = "approved"`; the draft bank must never serve real attendees.

## 6. Deploy the Worker

**Mac Terminal, inside `worker/`**

```sh
./node_modules/.bin/wrangler deploy
```

The five `/pmes/` pages deploy with the site (merge the PR; GitHub Actions publishes to Cloudflare Pages).
Deploy the Worker **before** merging so the pages never call routes that do not exist yet.

## 7. How the committee approves questions

The bank is `src/data/pmes-questions.json`, shared by the site and the Worker (the Worker bundles the same
file). Every question starts as `"status": "draft"`. When the committee confirms a question, change its
`status` to `"approved"` and commit; the next Worker deploy picks it up. Production draws only approved
questions, two per section across the ten sections, so **every section needs at least two approved
questions**; until then `POST /api/pmes/start` answers `503 bank-not-ready` and nobody can start the quiz.
Keep at least four questions per section so retakes are unlikely to repeat a question (`tests/pmes-questions.test.ts`
enforces four per section and four distinct options per question).

## 8. Rehearsal and go-live checklist (plan Task 15)

- [ ] Owner creates the D1 database and sets secrets (commands in `worker/README-pmes.md`, never in chat).
- [ ] Deploy Worker from `worker/`; merge PR to deploy Pages.
- [ ] Seed the presenters from the committee's list of names; set `PMES_DRAW_STATUS=draft` on preview, `approved` on production once the committee marks questions approved.
- [ ] Rehearsal session with the committee: 3 attendees, one pass, one fail-then-pass, one three-fail then override then pass; print both documents; confirm emails arrive at the coop inbox.

## 2026-10-26 update: application numbers and the timed quiz

Plan: `docs/superpowers/plans/2026-10-26-application-no-pmes-timer.md`.

- Membership submits issue `APP-YYYY-NNNN` (table `membership_applications`) and need a readable
  09XX mobile number. The PMES start with an application number asks for that number and the mobile
  on file; the name and email come from the application.
- The quiz is server-driven: `POST /api/pmes/start` serves question 1, `POST /api/pmes/answer`
  records one answer and serves the next, `POST /api/pmes/resume` continues after a reload.
  30 seconds per question (+5 s grace); a late or missing answer counts as wrong. `/submit` is gone.
  The session timer checkbox is gone; `timer_minutes` is no longer read.

Deploy order (Mac, in `worker/`), **not during a PMES session** (an attempt in progress on the old page breaks):

```bash
./node_modules/.bin/wrangler d1 migrations apply isatucmpc-pmes --remote   # adds 0002
./node_modules/.bin/wrangler deploy --var PMES_DRAW_STATUS:draft           # keep draft until the bank is approved
```

Then merge the PR (Pages). Between the two, the old membership page still works (`ok: true` is kept).
