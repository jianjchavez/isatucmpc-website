import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { resend, escapeHtml, type ResendMessage } from './resend';
import { buildOfficePacket, parseApplicant, toBase64, validSubscription, type Authority } from './membership/office-packet';
import { ageOn, monthlyDeduction } from './membership/deduction';
import { selfPaced } from './pmes/env';
import { issueApplicationNo, normalizeMobile } from './membership/applications';
import { parseApplicationRecord } from './membership/record';
import { pullRoutes } from './membership/pull-routes';
import { purgeExpiredPayloads } from './membership/retention';
import { verifyTurnstile } from './turnstile';
import { pmes } from './pmes/routes';

export type Env = {
  SITE_ORIGIN: string;
  TO_EMAIL: string;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET: string;
  PMES_DB: D1Database;
  WEBSITE_APP_PULL?: string;
  PMES_SELF_PACED?: string;
  WEBSITE_APP_PULL_SECRET?: string;
  MF_PULL_RL: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  PUBLIC_RL: { limit(opts: { key: string }): Promise<{ success: boolean }> };
};

const app = new Hono<{ Bindings: Env }>();

app.use('/api/submit', cors({
  origin: (origin, c) => {
    const allowed = (c.env.SITE_ORIGIN as string).split(',').map(o => o.trim()).filter(Boolean);
    return allowed.includes(origin) ? origin : null;
  },
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['content-type'],
  maxAge: 86400,
}));

// Explicit 405 for other methods on this route (OPTIONS handled by cors() above)
app.on(['GET', 'PUT', 'DELETE', 'PATCH', 'HEAD'], '/api/submit', c =>
  c.json({ error: 'method-not-allowed' }, 405),
);

app.post('/api/submit', async c => {
  const origin = c.req.header('origin');
  const allowed = c.env.SITE_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return c.json({ error: 'forbidden' }, 403);
  // Security P2 theme A: 30 per minute per client IP (Turnstile stays the main control).
  if (!(await c.env.PUBLIC_RL.limit({ key: `submit:${c.req.header('cf-connecting-ip') ?? 'unknown'}` })).success) {
    return c.json({ error: 'rate-limited' }, 429);
  }

  const body = await c.req.json<Record<string, string>>().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ error: 'invalid-body' }, 400);
  for (const key of ['name', 'email', 'message', 'cf-turnstile-response', 'form-source']) {
    if (body[key] !== undefined && typeof body[key] !== 'string') return c.json({ error: 'invalid-body' }, 400);
  }

  const {
    name,
    email,
    message,
    'cf-turnstile-response': token,
    'form-source': source = 'contact',
  } = body;

  if (!name || !email || !message || !token) return c.json({ error: 'missing-fields' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: 'invalid-email' }, 400);
  if (source === 'membership' && !validSubscription(body.shares, body.years)) return c.json({ error: 'invalid-subscription' }, 400);
  if (source === 'membership' && typeof body.applicant === 'string' &&
      new TextEncoder().encode(body.applicant).byteLength > 16 * 1024) {
    return c.json({ error: 'invalid-applicant' }, 400);
  }
  const applicant = source === 'membership' ? parseApplicant(body.applicant) : null;
  const mobile = normalizeMobile(applicant?.contactNumber ?? '');
  if (source === 'membership' && !mobile) return c.json({ error: 'invalid-mobile' }, 400);
  const record = source === 'membership' ? parseApplicationRecord(body.applicant) : null;
  if (source === 'membership') {
    // Cached forms used only these packet fields. A failed modern record must not
    // fall back and bypass its age, enum, or other contract validation.
    const legacy = !record && applicant && Object.keys(JSON.parse(body.applicant))
      .every(key => Object.hasOwn(applicant, key));
    if ((!record && !legacy) || (record && (record.shares !== Number(body.shares) || record.years !== Number(body.years)))) {
      return c.json({ error: 'invalid-applicant' }, 400);
    }
  }

  if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET, token))) return c.json({ error: 'turnstile-failed' }, 400);

  let applicationNo: string | null = null;
  if (source === 'membership') {
    try {
      applicationNo = await issueApplicationNo(c.env.PMES_DB, {
        fullName: name, mobile, email,
      }, new Date().toISOString(), c.env.WEBSITE_APP_PULL === 'on' && record ? record : undefined);
    } catch {
      // D1 errors may contain bound data. Do not pass them to Hono's default logger.
      return c.json({ error: 'storage-failed' }, 503);
    }
  }

  // Send via Resend to coop inbox
  const subject =
    source === 'membership' ? `[Membership inquiry] ${name} (${applicationNo})` : `[Contact form] ${name}`;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const authority: Authority | undefined = record && record.membershipType === 'Regular' && record.isatuEmployee
    ? {
        employeeNo: record.employeeNumber, office: record.office, shares: record.shares,
        deduction: monthlyDeduction(record.shares, record.years, ageOn(record.dateOfBirth, today)),
      }
    : undefined;
  const office = source === 'membership' ? await officePacket(record ? JSON.stringify(record) : body.applicant, applicationNo!, authority) : null;
  const online = record?.pmesMode === 'online' && selfPaced(c.env);
  const pmesNote = !applicationNo ? ''
    : online
      ? `<p>Your application number is <strong>${applicationNo}</strong>. Take the PMES online: watch the three videos at <a href="https://isatucmpc.coop/pmes/">isatucmpc.coop/pmes</a>, then take the quiz with this number and your mobile number.</p>`
      : `<p>Your application number is <strong>${applicationNo}</strong>. Please bring it to the PMES. Our face-to-face PMES is held every Wednesday, except holidays. Just contact us to confirm the date that works for you.</p>`;
  const html = `
    <p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
    <p><strong>Source:</strong> ${escapeHtml(source)}</p>
    ${office?.note ?? ''}
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
  `;
  const sent = await resend(c.env, {
    from: 'ISATUCMPC Website <noreply@isatucmpc.coop>',
    to: [c.env.TO_EMAIL],
    reply_to: email,
    subject,
    html,
    attachments: office?.attachments,
  });
  if (!sent) return c.json({ error: 'send-failed' }, 502);

  // Confirmation to submitter
  await resend(c.env, {
    from: 'ISATUCMPC <noreply@isatucmpc.coop>',
    to: [email],
    subject:
      source === 'membership'
        ? 'We received your membership inquiry'
        : 'We received your message',
    html: `<p>Salamat gid, ${escapeHtml(name)}.</p>${pmesNote}<p>We've received your message and will respond within 2 business days. For urgent matters, call (033) 330-2586 or 0950 108 8310 (call or text), or message us on Facebook Messenger: <a href="https://m.me/isatu.cmpc">m.me/isatu.cmpc</a>.</p><p><a href="https://m.me/isatu.cmpc"><img src="https://isatucmpc.coop/qr/messenger.png" width="120" height="120" alt="QR code: message ISATUCMPC on Messenger"></a><br>Scan to message us on Messenger.</p><p>— ISATUCMPC</p>`,
  });

  return c.json(applicationNo ? { ok: true, applicationNo } : { ok: true });
});

// Office pages for a membership application. A failure here never blocks the notification email.
async function officePacket(raw: unknown, applicationNo: string, authority?: Authority): Promise<{ note: string; attachments?: ResendMessage['attachments'] }> {
  const applicant = parseApplicant(raw);
  const failed = {
    note: "<p><strong>Office packet not attached</strong> (the applicant's details could not be read). Print the blank office forms from https://isatucmpc.coop/forms/Office_Packet.pdf.</p>",
  };
  if (!applicant) return failed;
  try {
    const today = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' });
    const bytes = await buildOfficePacket(applicant, today, applicationNo, authority);
    const safe = [applicant.lastName, applicant.firstName].join('_').replace(/[^a-zA-Z0-9_-]/g, '') || 'applicant';
    return {
      note: "<p><strong>Office packet attached:</strong> print it and have the applicant sign the Data Privacy Consent, the Depositor's Information Sheet and the Signature Card at the office" + (authority ? ", plus the Authority to Deduct from Salary (ISAT U employee)" : '') + ".</p>",
      attachments: [{ filename: `ISATUCMPC_Office_Packet_${safe}.pdf`, content: toBase64(bytes) }],
    };
  } catch {
    return failed;
  }
}

app.route('/api/pmes', pmes);
app.route('/api/mf', pullRoutes);

async function scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
  try {
    // Retention continues while pulls are disabled; turning off access must not retain PII.
    await purgeExpiredPayloads(env.PMES_DB, new Date(controller.scheduledTime).toISOString());
  } catch {
    // Preserve failure reporting/retries without propagating bound data from D1 errors.
    throw new Error('retention-failed');
  }
}

export default { fetch: app.fetch, scheduled };
