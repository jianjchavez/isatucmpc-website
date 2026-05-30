# T27 — DNS Cutover Runbook (`isatucmpc.coop` → Cloudflare)

**Status as of 2026-05-30:** ⛔ BLOCKED — waiting on DotCoop `.coop` eligibility approval.
Domain `isatucmpc.coop` is registered at Gandi (created 2026-05-25, WHOIS `ACTIVE`, no hold),
but DotCoop has not yet emailed an eligibility approval. A status inquiry was sent 2026-05-30.

**Do not start this runbook until** you have an explicit eligibility-approval email from DotCoop
(or the Gandi dashboard shows the domain's eligibility/verification as cleared). Cutting nameservers
over before approval risks the domain being suspended mid-flight.

Estimated execution time once unblocked: **~15 minutes of clicks + up to a few hours DNS propagation.**

---

## Before you start — what's already done (no action needed)

These were set up in earlier tasks and **do not** need to change during cutover:

- **Worker** (`isatucmpc-forms.jianjchavez.workers.dev`) — `SITE_ORIGIN` already includes
  `https://isatucmpc.coop` (comma-separated with `pages.dev`). **No Worker redeploy needed.**
- **Turnstile site** — hostnames already include `isatucmpc.coop` and `www.isatucmpc.coop`.
- **Site keys / secrets** — unchanged; the forms keep working through the cutover.

The only things that change are: **DNS hosting (Gandi → Cloudflare)** and **Pages custom domains**.

---

## Step 1 — Add the zone to Cloudflare DNS

1. dash.cloudflare.com → **the personal account** (`jianjchavez@gmail.com`, acct ID
   `2ef7540f84fa35081c572c223734e8db`; the coop Gmail is a Super Admin member there too).
2. **Add a site** → enter `isatucmpc.coop` → pick the **Free** plan.
3. Cloudflare will scan existing DNS. **Before changing nameservers**, make sure the records in
   Step 2 and Step 3 exist on the Cloudflare side, or mail will break the moment NS flips.

> ⚠️ **Save a Gandi DNS backup first.** Gandi → Domain → DNS Records → there's a Backup section.
> Snapshot it before touching anything so you can roll back.

---

## Step 2 — Re-add the 4 Resend records (CRITICAL for email)

Resend verified `isatucmpc.coop` via these records on **Gandi's** DNS. When DNS moves to
Cloudflare, Resend re-checks against Cloudflare's zone — if these are missing, the domain reverts
to **unverified** and **all form emails start bouncing.** Add them verbatim in Cloudflare DNS:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT  | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDWGjk4CXnwSHGDRs0fTfbQv2xin2QMePLyxUMCVL0bmeBJCpyX9cjZJq2bRJQOHbTAwdDmTq+2VmxILrWxJLApGnfFOh17mn4BydAMXu/kY2QDKD2HbWDASNcbNTOkbfUjOUO9luUIcoZ1CXmUL2V7fZGXDIy7JiWjaJ5WAJSMwwIDAQAB` | Auto |
| MX   | `send` | `feedback-smtp.ap-northeast-1.amazonses.com` (priority **10**) | Auto |
| TXT  | `send` | `v=spf1 include:amazonses.com ~all` | Auto |
| TXT  | `_dmarc` | `v=DMARC1; p=none;` | Auto |

Notes:
- In Cloudflare's UI the **Name** field is just the subdomain label (`resend._domainkey`, `send`,
  `_dmarc`) — Cloudflare appends `.isatucmpc.coop` automatically. Don't type the full name.
- For the MX record, the **priority `10`** goes in its own field; the value is the `feedback-smtp…`
  host **without** a trailing dot in Cloudflare's UI.
- Set all four to **DNS only** (grey cloud) — they're mail/auth records, not proxied web traffic.

---

## Step 3 — Apex SPF (optional — only if you keep Gandi's mailbox path)

The coop domain accepts inbound mail via Gandi's MX (`spool/fb.mail.gandi.net`). If you want to
preserve the existing apex (root) mail path, re-add Gandi's apex SPF on Cloudflare:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT  | `@` (root) | `v=spf1 include:_mailcust.gandi.net ?all` | Auto |

This is a **separate scope** from the `send` subdomain SPF in Step 2 (root vs `send.`), so they do
not conflict. If you also want Gandi's inbound MX, re-add those MX records from the Gandi backup too.
Skip this step entirely if you don't rely on `@isatucmpc.coop` mailboxes.

---

## Step 4 — Point the web records at Cloudflare Pages

The site itself is on Cloudflare Pages. After attaching custom domains (Step 6), Cloudflare can
auto-create these, but if you add them manually use CNAMEs to the Pages project:

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| CNAME | `@` (root) | `isatucmpc.pages.dev` | Proxied (orange) |
| CNAME | `www` | `isatucmpc.pages.dev` | Proxied (orange) |

(Cloudflare supports CNAME-at-root via flattening.) Easiest path: skip manual web records here and
let Step 6's "add custom domain" flow create them for you.

---

## Step 5 — Switch nameservers at Gandi

1. Cloudflare's onboarding screen shows **two assigned Cloudflare nameservers**
   (e.g. `xxx.ns.cloudflare.com` / `yyy.ns.cloudflare.com`). Copy them.
2. Gandi → `isatucmpc.coop` → **Nameservers** → switch from Gandi's
   (`ns-*.gandi.net`) to the two Cloudflare nameservers. Save.
3. Back in Cloudflare, click **Done, check nameservers**. Activation can take minutes to a few hours.

---

## Step 6 — Attach Pages custom domains

1. Cloudflare → **Workers & Pages** → the `isatucmpc` Pages project → **Custom domains**.
2. **Add custom domain** → `isatucmpc.coop` → follow the prompt (it'll create/verify the DNS record).
3. Repeat for `www.isatucmpc.coop`.
4. Cloudflare auto-provisions TLS certs for both. Wait for "Active."

---

## Step 7 — Verify (don't skip)

1. **DNS active:** Cloudflare zone overview shows the domain **Active** (not "Pending Nameserver Update").
   Cross-check: `whois isatucmpc.coop` should list the two `*.ns.cloudflare.com` nameservers.
2. **Site loads on the real domain:** open `https://isatucmpc.coop` and `https://www.isatucmpc.coop`
   — both should serve the site over HTTPS with a valid cert.
3. **Resend re-verified:** Resend dashboard → Domains → `isatucmpc.coop` should still read **Verified**
   (give it a few minutes after the records propagate). If it shows pending, re-check Step 2 record values.
4. **Forms still deliver end-to-end:** submit the contact form at `https://isatucmpc.coop/contact/`
   and confirm the email lands in `isatucmpc1964@gmail.com` (inbox, not spam). This is the real proof —
   it exercises Turnstile + the Worker + Resend on the new origin.

---

## Step 8 — Post-cutover housekeeping

- **Update the FB Page "Website" field** (and any printed/announcement links) from
  `https://isatucmpc.pages.dev` → `https://isatucmpc.coop`.
- **Update project memory** (`project_isatucmpc_website_state.md`) to mark T27 done and note the
  live custom-domain URL.
- **DMARC tightening** (separate follow-up, ~30 days after clean traffic): change the `_dmarc` TXT
  from `p=none` → `p=quarantine` for stronger spoofing protection.

---

## Rollback

If something breaks during cutover:
1. At Gandi, switch the nameservers **back** to Gandi's (`ns-*.gandi.net`).
2. Restore the Gandi DNS records from the backup taken in Step 1.
3. The site stays reachable at `https://isatucmpc.pages.dev` throughout — only the custom domain is affected.

---

*Source of record for the values above: project memory `project_isatucmpc_website_state.md`
(the "Gandi DNS records" snapshot and Worker/Turnstile config). If any value here disagrees with
that memory file, the memory file wins — update this runbook to match.*
