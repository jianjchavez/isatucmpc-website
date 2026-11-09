import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { resend, escapeHtml, type ResendMessage } from './resend';
import { buildOfficePacket, parseApplicant, toBase64, validSubscription } from './membership/office-packet';
import { issueApplicationNo, normalizeMobile } from './membership/applications';
import { verifyTurnstile } from './turnstile';
import { pmes } from './pmes/routes';

export type Env = {
  SITE_ORIGIN: string;
  TO_EMAIL: string;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET: string;
  PMES_DB: D1Database;
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

  const body = await c.req.json<Record<string, string>>().catch(() => null);
  if (!body) return c.json({ error: 'invalid-body' }, 400);

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
  const mobile = source === 'membership' ? normalizeMobile(parseApplicant(body.applicant)?.contactNumber ?? '') : '';
  if (source === 'membership' && !mobile) return c.json({ error: 'invalid-mobile' }, 400);

  if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET, token))) return c.json({ error: 'turnstile-failed' }, 400);

  const applicationNo = source === 'membership'
    ? await issueApplicationNo(c.env.PMES_DB, {
      fullName: name,
      mobile,
      email,
    }, new Date().toISOString())
    : null;

  // Send via Resend to coop inbox
  const subject =
    source === 'membership' ? `[Membership inquiry] ${name} (${applicationNo})` : `[Contact form] ${name}`;
  const office = source === 'membership' ? await officePacket(body.applicant, applicationNo!) : null;
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
    html: `<p>Salamat gid, ${escapeHtml(name)}.</p>${applicationNo ? `<p>Your application number is <strong>${applicationNo}</strong>. Use it with your mobile number to take the online PMES quiz at <a href="https://isatucmpc.coop/pmes/">isatucmpc.coop/pmes</a>, and bring it to the office.</p>` : ''}<p>We've received your message and will respond within 2 business days. For urgent matters, call (033) 330-2586 or 0950 108 8310 (call or text), or message us on Facebook Messenger: <a href="https://m.me/isatu.cmpc">m.me/isatu.cmpc</a>.</p><p><a href="https://m.me/isatu.cmpc"><img src="https://isatucmpc.coop/qr/messenger.png" width="120" height="120" alt="QR code: message ISATUCMPC on Messenger"></a><br>Scan to message us on Messenger.</p><p>— ISATUCMPC</p>`,
  });

  return c.json(applicationNo ? { ok: true, applicationNo } : { ok: true });
});

// Office pages for a membership application. A failure here never blocks the notification email.
async function officePacket(raw: unknown, applicationNo: string): Promise<{ note: string; attachments?: ResendMessage['attachments'] }> {
  const applicant = parseApplicant(raw);
  const failed = {
    note: "<p><strong>Office packet not attached</strong> (the applicant's details could not be read). Print the blank office forms from https://isatucmpc.coop/forms/Office_Packet.pdf.</p>",
  };
  if (!applicant) return failed;
  try {
    const today = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' });
    const bytes = await buildOfficePacket(applicant, today, applicationNo);
    const safe = [applicant.lastName, applicant.firstName].join('_').replace(/[^a-zA-Z0-9_-]/g, '') || 'applicant';
    return {
      note: "<p><strong>Office packet attached:</strong> print it and have the applicant sign the Data Privacy Consent, the Depositor's Information Sheet and the Signature Card at the office.</p>",
      attachments: [{ filename: `ISATUCMPC_Office_Packet_${safe}.pdf`, content: toBase64(bytes) }],
    };
  } catch {
    return failed;
  }
}

app.route('/api/pmes', pmes);

export default app;
