import { Hono } from 'hono';

type Env = {
  SITE_ORIGIN: string;
  TO_EMAIL: string;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET: string;
};

const app = new Hono<{ Bindings: Env }>();

// Explicit 405 for other methods on this route
app.on(['GET', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'], '/api/submit', c =>
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

  // Verify Turnstile
  const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: c.env.TURNSTILE_SECRET, response: token }),
  });
  const tsJson = await tsRes.json<{ success: boolean }>();
  if (!tsJson.success) return c.json({ error: 'turnstile-failed' }, 400);

  // Send via Resend to coop inbox
  const subject =
    source === 'membership' ? `[Membership inquiry] ${name}` : `[Contact form] ${name}`;
  const html = `
    <p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
    <p><strong>Source:</strong> ${escapeHtml(source)}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
  `;
  const sendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: 'ISATUCMPC Website <noreply@isatucmpc.coop>',
      to: [c.env.TO_EMAIL],
      reply_to: email,
      subject,
      html,
    }),
  });
  if (!sendRes.ok) return c.json({ error: 'send-failed' }, 502);

  // Confirmation to submitter
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: 'ISATUCMPC <noreply@isatucmpc.coop>',
      to: [email],
      subject:
        source === 'membership'
          ? 'We received your membership inquiry'
          : 'We received your message',
      html: `<p>Salamat gid, ${escapeHtml(name)}.</p><p>We've received your message and will respond within 2 business days. For urgent matters, please call (033) 330-2586.</p><p>— ISATUCMPC</p>`,
    }),
  });

  return c.json({ ok: true });
});

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  );
}

export default app;
