# PMES Quiz and Certification — Design

Date: 2026-10-21 · Status: DRAFT for owner review · Repo: `isatucmpc-website` · Branch: `feat/pmes-quiz`

## 1. Intent

After the Pre-Membership Education Seminar (PMES), every attendee takes a short multiple-choice quiz on their phone or the office kiosk. A code announced by the presenter in the room proves attendance. A pass issues a numbered Certificate of Completion that the applicant attaches to their membership application, and a per-session results sheet that the Education and Training Committee attaches to the Board resolution approving the batch of applicants. By-Laws Art. II Sec. 3(b) makes the PMES certificate a requirement for membership; this feature makes it verifiable and consistent.

Owner decisions (fixed): platform is the website on Cloudflare Pages plus the existing `isatucmpc-forms` Worker with a D1 database; pass mark 80% (16 of 20) with up to two retakes; signatories are the session presenter and the Chair of the Education and Training Committee, who under By-Laws Art. VI is the Vice-Chairperson of the Board of Directors (not the Board Chairperson); identity is application number (or member number for existing members) plus full name, mobile number and email; results are shown on the page and emailed to the attendee and to `isatucmpc1964@gmail.com`; the score appears on the certificate.

## 2. Goals, non-goals, anti-goals

Goals
- Attendees finish the quiz in under 20 minutes on a phone with no account.
- The presenter runs a session with nothing but a browser: create session, read out the code, print the results sheet.
- Every certificate is numbered, verifiable online, and carries the score.
- The question bank is a data file the committee can edit without a developer.

Non-goals (v1): proctoring beyond the session code, Hiligaynon version, SMS, automatic write-back to MemberFolio, accounts for attendees.

Anti-goals: a quiz that can be passed without attending (no valid code, no quiz); a certificate that cannot be traced to a session, a presenter and an attempt; storing more personal data than the four identity fields and the answers.

## 3. Actors and flows

### 3.1 Presenter (Education and Training Committee)

1. Signs in at `/pmes/admin/` with a presenter username and password.
2. Creates a session: date (default today, Asia/Manila), venue, presenter name (prefilled from the account's full name), the name of the Education and Training Committee Chair (the Board Vice-Chairperson) as it should appear on the certificates (prefilled from the last session; the form labels the field "Education and Training Committee Chair (BOD Vice-Chairperson)"), timer on/off (default on, 20 minutes). The server issues the session code, format `PMES-XXXX`, four characters from the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0, O, 1, I), unique among sessions of the same date. The code is valid from creation until 23:59:59 Asia/Manila on the session date, or until the presenter closes the session.
3. Announces the code at the end of the seminar.
4. Watches the roster fill: name, ID, attempts, best score, pass/fail, certificate number, time.
5. Prints the PMES Session Results Sheet (Tier 1 letterhead) and exports CSV. Closes the session.
6. Override: when an attendee has used all three attempts, the presenter (on the committee's decision) clicks "Allow another attempt" on that roster row and enters a reason. This grants three more attempts for that identity in that session, is recorded with the presenter's name and time, and appears on the results sheet as a footnote on that row.

### 3.2 Attendee (applicant or member)

1. Opens `/pmes/` on a phone or the kiosk.
2. Enters: identity type (Membership Application Number, or Member Number for existing members), the number, full name, mobile number (Philippine mobile, 11 digits starting with 09), email, and ticks the data privacy consent (text links to the website privacy notice). Enters the session code. Passes Turnstile.
3. Server validates the code and the attempt count, draws 20 questions (2 per section from the 10 sections, shuffled, options shuffled), stores the draw, returns the questions without answers.
4. Answers one question per screen with a progress bar and the timer; may go back. Submits, or is auto-submitted when the timer ends.
5. Server scores, stores, and returns: score (n of 20), pass/fail at 16, sections to review (sections with any wrong answer), certificate number and certificate link on pass, retakes remaining on fail (max 3 attempts per identity per session, plus 3 per committee override; each retake is a fresh draw). After the last attempt the page says "Please see the Education and Training Committee. The presenter can allow another attempt."
6. Email: result to the attendee's email and a copy to the cooperative. The certificate link is in the email.

### 3.3 Verifier (Secretary, Board, applicant)

- `/pmes/verify/?no=PMES-2026-0042` shows: certificate number, attendee name, ID number, session date, score, pass, presenter, issue time. No contact details. Any certificate printed can be checked against it.

## 4. Pages (Astro, static, client scripts in TypeScript like `public/forms.js` and `src/components/*-logic.ts`)

| Route | Purpose |
|---|---|
| `/pmes/` | Attendee: identity form, code entry, quiz, result |
| `/pmes/certificate/` | Certificate of Completion, read by `?no=&key=` (key = per-certificate random token from the email/result page); print-to-PDF layout, Tier 0 letterhead |
| `/pmes/verify/` | Public verification by certificate number |
| `/pmes/admin/` | Presenter sign-in, session list, create session, roster, close session, CSV |
| `/pmes/admin/results-sheet/` | Session Results Sheet, print layout, Tier 1 letterhead |

All five pages are static HTML shells; data comes from the Worker API. The attendee and admin pages must work at phone width. The certificate and results sheet are A4 print layouts.

## 5. Worker API (`worker/src/`, Hono, same Worker `isatucmpc-forms`)

Base path `/api/pmes/`. CORS as today (origin allowlist `SITE_ORIGIN`). JSON in, JSON out. Errors are `{ error: "<kebab-code>" }` with 4xx/5xx.

Attendee
- `POST /api/pmes/start` `{ code, idType: "application"|"member", idNumber, fullName, mobile, email, consent: true, turnstile }` → `{ attemptId, attemptNo, deadlineAt|null, questions: [{ n, id, section, text, options: [a,b,c,d] }] }`. Errors: `invalid-code`, `session-closed`, `code-expired`, `attempts-exhausted` (after 3), `already-passed`, `missing-fields`, `invalid-mobile`, `invalid-email`, `consent-required`, `turnstile-failed`.
- `POST /api/pmes/submit` `{ attemptId, answers: [{ n, choice: 0..3|null }] }` → `{ score, total: 20, passed, reviewSections: [...], certificateNo|null, certificateKey|null, retakesLeft }`. Errors: `unknown-attempt`, `already-submitted`, `expired` (past deadline + 120 s grace; the attempt is stored with score 0 and counts).

Certificate and verification
- `GET /api/pmes/certificate?no=&key=` → full certificate record (for the print page).
- `GET /api/pmes/verify?no=` → public subset.

Admin (cookie `pmes_admin`, HMAC-signed with `PMES_SESSION_SECRET`, 12-hour expiry, `HttpOnly; Secure; SameSite=Lax`)
- `POST /api/pmes/admin/login` `{ username, password }`; `POST /api/pmes/admin/logout`.
- `GET /api/pmes/admin/sessions`; `POST /api/pmes/admin/sessions` `{ sessionDate, venue, presenterName, chairName, timerMinutes: 20|0 }` → `{ id, code, ... }`; `POST /api/pmes/admin/sessions/:id/close`.
- `POST /api/pmes/admin/sessions/:id/override` `{ idType, idNumber, reason }` → `{ extraAttempts: 3 }`; recorded in `pmes_overrides` with the presenter id.
- `GET /api/pmes/admin/sessions/:id/roster` → rows per identity with all attempts; `GET /api/pmes/admin/sessions/:id/roster.csv`.

Scoring, drawing and shuffling happen only on the server. The client never receives the correct option index.

## 6. Data (Cloudflare D1, database `isatucmpc-pmes`, binding `PMES_DB`)

```sql
CREATE TABLE pmes_presenters (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL);
CREATE TABLE pmes_sessions (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL, session_date TEXT NOT NULL, venue TEXT NOT NULL,
  presenter_name TEXT NOT NULL, chair_name TEXT NOT NULL, presenter_id INTEGER NOT NULL REFERENCES pmes_presenters(id),
  timer_minutes INTEGER NOT NULL DEFAULT 20, status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL, closed_at TEXT, UNIQUE(session_date, code));
CREATE TABLE pmes_attempts (
  id TEXT PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES pmes_sessions(id),
  attempt_no INTEGER NOT NULL, id_type TEXT NOT NULL, id_number TEXT NOT NULL,
  full_name TEXT NOT NULL, mobile TEXT NOT NULL, email TEXT NOT NULL,
  consent_at TEXT NOT NULL, draw_json TEXT NOT NULL, answers_json TEXT,
  score INTEGER, passed INTEGER, started_at TEXT NOT NULL, deadline_at TEXT,
  submitted_at TEXT, status TEXT NOT NULL DEFAULT 'started',
  UNIQUE(session_id, id_type, id_number, attempt_no));
CREATE TABLE pmes_certificates (
  no TEXT PRIMARY KEY, year INTEGER NOT NULL, seq INTEGER NOT NULL, attempt_id TEXT NOT NULL UNIQUE REFERENCES pmes_attempts(id),
  key TEXT NOT NULL, issued_at TEXT NOT NULL, email_status TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE pmes_counters (year INTEGER PRIMARY KEY, next_seq INTEGER NOT NULL);
CREATE TABLE pmes_overrides (
  id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES pmes_sessions(id),
  id_type TEXT NOT NULL, id_number TEXT NOT NULL, extra_attempts INTEGER NOT NULL DEFAULT 3,
  reason TEXT NOT NULL, presenter_id INTEGER NOT NULL REFERENCES pmes_presenters(id), created_at TEXT NOT NULL);
```

- Attempt limit for an identity in a session = 3 + 3 × (number of override rows for that identity).

- `id` of an attempt is a random 128-bit hex string. `draw_json` is `[{ id, optionOrder: [perm of 0..3] }]` in presentation order. `answers_json` is the submitted choices in presentation order.
- Certificate number: `PMES-YYYY-NNNN`, `seq` taken with `UPDATE pmes_counters SET next_seq = next_seq + 1 WHERE year = ? RETURNING next_seq` (single statement, atomic); the year row is inserted on first use.
- Passwords: PBKDF2-SHA256, 100,000 iterations, 16-byte salt, via WebCrypto. Presenters are created by a script run with `wrangler d1 execute` (no self-registration). The login identifier is the presenter's full name as the committee lists it (`username` holds the name, compared case-insensitively after trimming); `display_name` is the same value.
- Retention: attempts and certificates are kept indefinitely (they back Board approvals). Mobile and email are shown only on the admin roster and in emails.

## 7. Question bank

File: `src/data/pmes-questions.json` (committed; served to the Worker by bundling the same file into the Worker build through a relative import, so the site and the Worker share one source).

```json
{ "version": 1, "sections": [{ "id": "idea", "title": "The cooperative idea" }, ...],
  "questions": [{ "id": "idea-01", "section": "idea", "slide": 4, "text": "...",
    "options": ["...", "...", "...", "..."], "answer": 0, "source": "Slide 4", "status": "draft" }] }
```

Rules: exactly four options; `answer` is the index of the correct option; every question cites the deck slide; at least four questions per section so a draw of two never repeats within a session's three attempts by chance alone; questions whose facts are marked CONFIRM in the deck script are excluded until confirmed. The committee vets the bank from the spreadsheet copy `PMES-Question-Bank-v1.csv` on the External Disk; edits go back into the JSON. `status` moves from `draft` to `approved`; only approved questions are drawn in production (`PMES_DRAW_STATUS` var, default `approved`; `draft` in preview).

Draw: for each of the 10 sections pick 2 approved questions at random; shuffle the 20; shuffle each question's options; record the permutation. Randomness from `crypto.getRandomValues`.

## 8. Emails (Resend, sender `ISATUCMPC <noreply@isatucmpc.coop>`)

- To attendee, subject `PMES result: PASSED, Certificate PMES-2026-0042` or `PMES result: 13 of 20, retake available`. Body: name, session date and code, score, pass/fail, certificate link `https://isatucmpc.coop/pmes/certificate/?no=…&key=…` on pass, retakes left on fail, the office contact line.
- To the cooperative (`TO_EMAIL`), same content plus ID type and number, mobile, attempt number, presenter. `reply_to` is the attendee's email.
- Send failures do not fail the submission; `email_status` records `sent` or `failed`, and the admin roster shows a resend button (v1: resend by re-calling the same send function).

## 9. Certificate and results sheet

Both templates follow the `isatucmpc-letterhead` skill exactly: the organization name only as the two-line uppercase string "ILOILO SCIENCE AND TECHNOLOGY UNIVERSITY AND / COMMUNITY MULTI-PURPOSE COOPERATIVE (ISATUCMPC)"; `@page { size: A4 }`; brand tokens; Montserrat and Open Sans.

Certificate of Completion (Tier 0, seal, ornate border, title 22pt): "This certifies that **[Full name]** ([Application No. / Member No.]) has completed the Pre-Membership Education Seminar held on [date] at [venue] and passed the certification quiz with a score of [n] of 20 ([%])." Certificate No., session code, issued date-time, two signature lines: "[Presenter name], Presenter, Education and Training Committee" and "[Name], Chair, Education and Training Committee / Vice-Chairperson, Board of Directors" (name from the session's `chair_name`, entered by the presenter when the session is created). The Session Results Sheet carries the same two signature lines. Footer: website QR at 12 mm bottom-right, verification URL, "This document is not valid without the signature of the authorized signatory."

Session Results Sheet (Tier 1, lean header, no seal): session date, venue, code, presenter; table of attendees sorted by name: No., Name, ID, Attempts, Best score, Result, Certificate No.; totals (attended, passed, failed); two signature lines as above; `Page X of Y`.

## 10. Security and privacy

- Turnstile on `start`. Rate limit `start` to 10 per IP per 10 minutes (Workers rate-limit binding `PMES_RL`).
- Correct answers never leave the server; the draw is server-side; scoring is server-side.
- Admin cookie HMAC-signed; passwords PBKDF2; no self-registration; sessions can be closed early.
- Certificate page needs the per-certificate key; the public verify endpoint returns no contact details.
- Privacy consent text: "I consent to ISATUCMPC processing my name, application or member number, mobile number, email and quiz answers for membership processing, under the Data Privacy Act of 2012 and the cooperative's privacy notice." Stored as `consent_at`.
- Content Security Policy in `public/_headers` must allow the Worker origin and Turnstile, as the forms already do.

## 11. Configuration

Worker `wrangler.toml` additions: `[[d1_databases]] binding = "PMES_DB", database_name = "isatucmpc-pmes"`; `[[unsafe.bindings]]` rate limit `PMES_RL` (10 per 600 s); vars `PMES_DRAW_STATUS`, `PMES_PASS_MARK = 16`, `PMES_QUIZ_SIZE = 20`, `PMES_MAX_ATTEMPTS = 3`, `SITE_URL = https://isatucmpc.coop`. Secrets: `PMES_SESSION_SECRET`. Migrations in `worker/migrations/0001_pmes.sql`, applied with `wrangler d1 migrations apply`.

## 12. Testing

- Worker: Vitest with `@cloudflare/vitest-pool-workers` and a D1 test binding (miniflare), covering code generation and expiry, draw composition (2 per section, 20 total, options permuted), attempt limits, scoring and pass mark, certificate numbering across a year boundary, admin auth, CSV output, and the error codes above.
- Client logic in `src/components/pmes-logic.ts` (timer, progress, answer state, result rendering) tested with Vitest like `eligibility-logic.ts`.
- `astro check` and `astro build` clean; the five pages render; `pa11y` on `/pmes/` and `/pmes/admin/`.
- Manual: one rehearsal session with the Education and Training Committee on the preview deployment before go-live.

## 13. What is left to the builder

Visual design of the quiz screens within the brand; exact CSV column order; the presenter seeding script's interface; choice between one Astro page with client-side routing and several pages for the attendee flow (either is fine); whether to inline the question bank into the Worker bundle or fetch it from the site at request time (bundling is preferred for consistency).

## 14. Owner rulings on the open items (2026-10-21)

1. The name of the Education and Training Committee Chair (the Board Vice-Chairperson, never the Board Chairperson) is entered by the presenter when creating the session; it is not a deployment setting.
2. After three failed attempts the committee may override: the presenter grants another block of three attempts from the roster, with a reason, and the attendee takes the quiz again.
3. Presenter accounts are identified by full name; the committee supplies the list of names before seeding.
