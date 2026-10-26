# Application Numbers + Timed PMES Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Number every website membership application (`APP-YYYY-NNNN`), let applicants start the PMES quiz with that number, time each quiz question at 30 s on the server, and show missed questions with the correct answer on the result.

**Architecture:** The `isatucmpc-forms` Worker issues the number from a per-year D1 counter in `PMES_DB` and stores a minimal application row. The quiz moves from "all 20 questions + one submit" to a server-driven sequence: `/start` serves question 1, `/answer` records one answer and serves the next, `/resume` returns the current question after a reload; a late answer counts as wrong and idle time keeps expiring questions. The membership page waits for the Worker's number before building the applicant PDF.

**Tech Stack:** Cloudflare Workers + Hono + D1, vitest with `@cloudflare/vitest-pool-workers`, Astro pages, pdf-lib.

**Spec:** owner rulings 2026-10-26 (this conversation): 30 s per question; `APP-2026-0001` format; missed items show the attendee's answer and the correct answer. Earlier quiz spec: `docs/superpowers/specs/2026-10-21-pmes-quiz-design.md`.

## Global Constraints

- Number format `APP-${year}-${seq padded to 4}`; year = Manila (UTC+8) year of the submit time. Gaps are acceptable.
- Per-question limit `QUESTION_SECONDS = 30`, latency grace `ANSWER_GRACE_MS = 5000`. Pass mark, quiz size, attempt limits unchanged (`PMES_PASS_MARK`, `PMES_QUIZ_SIZE`, `PMES_MAX_ATTEMPTS`).
- Privacy: no endpoint returns applicant data for a number alone. The quiz start for `idType: 'application'` requires the number **and** the mobile on file; mismatch and unknown number return the same `unknown-application` error.
- Coop email subject stays `[Membership inquiry] <name>` followed by ` (APP-YYYY-NNNN)`: prefix and name first (the Telegram Apps Script parses it).
- Mobile numbers are stored and compared normalized to `09XXXXXXXXX` (strip non-digits; leading `63` → `0`).
- `/api/pmes/submit` (bulk answers) is removed: it would bypass the timer.
- Deploy order (owner): `wrangler d1 migrations apply isatucmpc-pmes --remote` → `wrangler deploy` → merge the PR (Pages). The new Worker must keep the old membership page working (`ok: true` stays in the response).
- Gates: `cd worker && npx vitest run`; repo root `npx vitest run`, `npx astro check` (0 errors), `npx astro build`.

## Review Focus

1. Two answers for the same question arrive together (double tap, retry after a timeout): exactly one is recorded; the other gets the current state, never a second advance.
2. Attendee closes the tab for 3 minutes mid-quiz and reopens: six questions have expired as wrong, the clock for the current one shows the remaining seconds, not a fresh 30.
3. Answer arrives at 33 s (slow phone): within grace, counted; at 36 s: counted wrong, next question served.
4. Applicant types the mobile as `0917 123 4567` or `+63 917 123 4567` on either form: still matches.
5. Membership submit where the email send fails: response is an error, the page shows the failure and does not download a PDF with a number nobody received.

---

### Task 1: Schema `[critical]`

**Files:**
- Create: `worker/migrations/0002_applications_and_timed_quiz.sql`
- Modify: `worker/tests/pmes/schema.test.ts`

**Interfaces:**
- Produces tables `membership_applications(no TEXT PRIMARY KEY, year INTEGER NOT NULL, seq INTEGER NOT NULL, full_name TEXT NOT NULL, mobile TEXT NOT NULL, email TEXT NOT NULL, created_at TEXT NOT NULL)`, `application_counters(year INTEGER PRIMARY KEY, next_seq INTEGER NOT NULL)`; columns `pmes_attempts.current_n INTEGER NOT NULL DEFAULT 1`, `pmes_attempts.served_at TEXT`.

- [ ] **Step 1: Failing test** `schema.test.ts › has application tables and timed-attempt columns`: `PRAGMA table_info` lists the columns above for each table.
- [ ] **Step 2:** run `cd worker && npx vitest run tests/pmes/schema.test.ts` → FAIL.
- [ ] **Step 3:** write the migration (two `CREATE TABLE`, two `ALTER TABLE pmes_attempts ADD COLUMN`).
- [ ] **Step 4:** test → PASS; full worker suite still green.
- [ ] **Step 5:** commit `feat(db): membership applications and timed-attempt columns`.

### Task 2: Issue application numbers on membership submit `[coding]`

**Files:**
- Create: `worker/src/membership/applications.ts`
- Modify: `worker/src/index.ts` (membership branch), `worker/src/membership/office-packet.ts`, `worker/src/membership/office-fields.json`
- Test: `worker/tests/membership.test.ts`, create `worker/tests/applications.test.ts`

**Interfaces:**
- Produces `normalizeMobile(raw: string): string` (returns `''` when not 11 digits starting `09` after normalizing), `issueApplicationNo(db: D1Database, a: { fullName: string; mobile: string; email: string }, nowIso: string): Promise<string>`, `findApplication(db: D1Database, no: string): Promise<{ no: string; fullName: string; mobile: string; email: string } | null>` (all in `applications.ts`).
- `buildOfficePacket(a, consentDate, applicationNo: string)` gains the third parameter; field `applicationNo` added to `office-fields.json` on every page header (right of the page title, size 9).
- `POST /api/submit` with `form-source: membership` returns `{ ok: true, applicationNo }`; contact form unchanged.

- [ ] **Step 1: Failing tests**
  - `applications.test.ts › issues APP-2026-0001 then APP-2026-0002 within a year and restarts at 0001 next year` (nowIso `2026-12-31T15:59:59Z` → 2026; `2026-12-31T16:00:00Z` → 2027).
  - `› normalizeMobile` cases: `'0917 123 4567'`→`'09171234567'`, `'+63 917 123 4567'`→`'09171234567'`, `'12345'`→`''`.
  - `› findApplication returns the stored row and null for an unknown number`.
  - `membership.test.ts › membership submit returns applicationNo, subject is "[Membership inquiry] Juan Dela Cruz (APP-2026-0001)", confirmation email html contains APP-2026-0001`; `› office packet attachment still present`; `› contact submit has no applicationNo`; `› a failed email send returns 502 with no applicationNo`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement. In `index.ts`, issue the number after Turnstile passes and before building the email; store `fullName = name`, `mobile = normalizeMobile(applicant contactNumber)` (empty string allowed when unparseable), `email`. Confirmation email adds `Your application number is <strong>APP-…</strong>. Please bring it to the PMES.` `Env` gains `PMES_DB: D1Database`.
- [ ] **Step 4:** worker suite green.
- [ ] **Step 5:** commit `feat(membership): number each application APP-YYYY-NNNN`.

### Task 3: Application number on the applicant PDF; page waits for it `[coding]`

**Files:**
- Modify: `src/lib/pdf-fill.ts` (`PdfFieldData.applicationNo?: string`; coord on page 1 of both variants under the "MEMBER NO. / For coop use only" box, `{ x: 428, top: 76, size: 9 }`, text `APPLICATION NO. ${no}`; same line on the subscription page header), `src/components/MembershipForm.astro`, `public/forms.js`
- Test: `tests/lib/pdf-fill.test.ts` (create if absent)

**Interfaces:**
- Consumes `{ ok: true, applicationNo }` from Task 2.

- [ ] **Step 1: Failing test** `pdf-fill › draws the application number on page 1 and page 2` (fill with `applicationNo: 'APP-2026-0001'`, extract text with pdf-lib or check that the drawn string appears in the content stream).
- [ ] **Step 2:** run root `npx vitest run tests/lib/pdf-fill.test.ts` → FAIL.
- [ ] **Step 3:** implement the coord + draw. In `MembershipForm.astro`, own the submit for the membership form: post to the Worker itself, on `ok` fill the PDF with `applicationNo` and show `Application number APP-…: your PDF is downloading.`; on failure show the existing error and do not build the PDF. Remove `attach('membership-form', 'mf-result')` from `forms.js` (contact form stays).
- [ ] **Step 4:** root vitest, `npx astro check`, `npx astro build` green. Render a filled PDF with `pdftoppm` and look at the number's position.
- [ ] **Step 5:** commit `feat(membership): application number on the applicant PDF`.

### Task 4: Server-driven, timed quiz `[critical]`

**Files:**
- Create: `worker/src/pmes/flow.ts`
- Modify: `worker/src/pmes/routes.ts` (`/start`), `worker/src/pmes/submit.ts` (remove `POST /submit`; add `POST /answer`, `POST /resume`), `worker/src/pmes/score.ts`, `worker/src/pmes/admin.ts` + `sessions.ts` (stop reading/writing `timerMinutes`; column stays)
- Test: `worker/tests/pmes/start.test.ts`, `worker/tests/pmes/submit.test.ts` → rename to `answer.test.ts`, `worker/tests/pmes/score.test.ts`, `worker/tests/pmes/flow.test.ts`

**Interfaces:**
- Consumes `findApplication`, `normalizeMobile` (Task 2).
- `flow.ts` produces:
  - `QUESTION_SECONDS = 30`, `ANSWER_GRACE_MS = 5000`
  - `advance(answers: (number|null)[], currentN: number, servedAtMs: number, nowMs: number, total: number): { answers; currentN; servedAtMs }` — while `nowMs > servedAtMs + 30_000 + 5000` and `currentN <= total`: `answers[currentN-1] = null`, `servedAtMs += 30_000`, `currentN++`. `currentN > total` means finished.
  - `type Step = { attemptId: string; fullName: string; total: number; question: PresentedQuestion; secondsLeft: number }`
  - `type Missed = { n: number; text: string; yourAnswer: string | null; correctAnswer: string; slide: number }`
  - `type Final = { score; total; passed; reviewSections; missed: Missed[]; certificateNo; certificateKey; retakesLeft; message? }`
- `scoreAttempt` result gains `missed: Missed[]` (answer texts resolved through `optionOrder`, `yourAnswer: null` when unanswered/late).
- Endpoints:
  - `POST /start`: `idType: 'application'` → body `{ code, idType, idNumber, mobile, consent, turnstile }`; look up the application, compare `normalizeMobile(mobile)`; on mismatch/unknown `400 { error: 'unknown-application' }`; name/email come from the application. `idType: 'member'` keeps the current fields. Inserts attempt with `current_n = 1, served_at = now, answers_json = '[null,…]'`, `deadline_at = null`. Returns `Step` for question 1 (`secondsLeft: 30`).
  - `POST /answer` `{ attemptId, n, choice: 0..3 | null }`: load `status='started'` attempt, apply `advance` with now; if `n !== currentN` after advancing → `200` with the current `Step` (or `Final`) and `stale: true`, nothing recorded; else record `choice` (null when invalid), `currentN++`, `served_at = now`. Persist with `UPDATE … WHERE id = ? AND current_n = ?` (the pre-read value); `changes = 0` → reload and return current state with `stale: true`. When `currentN > total`: finalize exactly as the old `/submit` did after scoring (claim `status 'started' → 'submitting'`, score, certificate, emails, retakes) and return `Final`.
  - `POST /resume` `{ attemptId }`: apply `advance`, persist, return `Step`, or `Final` (finalizing if needed; already-finalized attempts return the stored result rebuilt from `answers_json`).
  - Unknown attempt → `404 unknown-attempt`.

- [ ] **Step 1: Failing tests**
  - `flow.test.ts › advance` cases: no time passed → unchanged; `nowMs = served + 34_999` → unchanged; `served + 35_001` → current item null, `currentN + 1`, `servedAtMs = served + 30_000`; `served + 3*60_000` → 6 items expired; past the last item → `currentN = total + 1`.
  - `start.test.ts › application start needs the matching mobile` (issue `APP-2026-0001` with `09171234567`; start with `'+63 917 123 4567'` → 200, `fullName` from the application; with `09999999999` → `unknown-application`; unknown number → `unknown-application`); `› returns only question 1 with secondsLeft 30`; `› member start unchanged`.
  - `answer.test.ts › 20 answers in order finish with score, missed items and certificate on pass`; `› duplicate answer for the same n records once and returns stale`; `› answer after 36 s is recorded as null and the next question is served`; `› resume after 3 minutes shows question 7 with the remaining seconds`; `› resume of a finished attempt returns the final result`; `› /api/pmes/submit is gone (404)`; `› missed item shows yourAnswer, correctAnswer and slide`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement; reuse the old submit's finalize code by moving it into `finalize(c, attempt, answers, nowIso): Promise<Final>` in `submit.ts`.
- [ ] **Step 4:** worker suite green (old submit tests ported to the new flow, not deleted).
- [ ] **Step 5:** commit `feat(pmes): one question at a time, 30 s each, missed items on the result`.

### Task 5: Quiz page for the timed flow `[coding]`

**Files:**
- Modify: `src/components/pmes-logic.ts`, `src/pages/pmes/index.astro`, `src/pages/pmes/admin/index.astro` (drop the timer checkbox; session meta shows `30 s per question`)
- Test: `tests/pmes-logic.test.ts`, `tests/pmes-pages.test.ts`

**Interfaces:**
- Consumes `Step` / `Final` / `stale` from Task 4.
- `pmes-logic.ts` produces `StartRequest` (application variant without name/email), `Step`, `Final`, `Missed` types; `deadlineFromStep(step: Step, nowMs: number): number`; `renderResult(r: Final)` gains `missedLines: { question: string; yours: string; correct: string; slide: number }[]` with `yours = 'No answer (time ran out)'` when null; error copy for `unknown-application`: `That application number and mobile number do not match our records. Use the number on your application form and the mobile number you gave.`

- [ ] **Step 1: Failing tests** in `pmes-logic.test.ts` for `deadlineFromStep`, `renderResult` missed lines (null answer copy), `errorMessage('unknown-application')`; in `pmes-pages.test.ts` the start form hides name/email when "Membership Application Number" is chosen and the quiz page has no Back button.
- [ ] **Step 2:** run root vitest → FAIL.
- [ ] **Step 3:** implement. Page: identity select toggles name/email fields (required only for member); one question at a time with a 30-second countdown from `secondsLeft`; tapping an option enables **Next**; **Next** or 0 s posts `/answer` (null at 0 s); store `attemptId` in `sessionStorage` and call `/resume` on load; result shows score, certificate link, sections, and a "Questions you missed" list (question, your answer, correct answer, slide). Question text gets `user-select: none`.
- [ ] **Step 4:** root vitest, `astro check`, `astro build` green.
- [ ] **Step 5:** commit `feat(pmes): timed one-question quiz page with missed answers`.

### Task 6: Docs `[mechanical]`

**Files:** `worker/README-pmes.md` (deploy order above; new endpoints), quiz spec §5 note pointing to this plan.

- [ ] Update, commit `docs(pmes): timed quiz and application numbers`.
