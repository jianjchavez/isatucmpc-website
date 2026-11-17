import { Hono, type MiddlewareHandler } from 'hono';
import type { Env } from '../index';
import { deletePayload } from './applications';
import { purgeExpiredPayloads } from './retention';
import type { WebsiteApplicationRecord } from './record';

type PullApp = { Bindings: Env };
export const pullRoutes = new Hono<PullApp>();

// Never hand D1/JSON exceptions (which may contain applicant data) to Hono's logger.
pullRoutes.onError((_error, c) => c.json({ error: 'storage-failed' }, 503));
pullRoutes.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});

async function authenticated(header: string | undefined, secret: string): Promise<boolean> {
  const token = /^Bearer ([^\s]+)$/i.exec(header ?? '')?.[1] ?? '';
  const encoder = new TextEncoder();
  const [actual, expected] = await Promise.all([token, secret].map(async value =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))));
  // Both digests are always 32 bytes, including for missing/malformed headers.
  let difference = 0;
  for (let i = 0; i < 32; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}

const requirePull: MiddlewareHandler<PullApp> = async (c, next) => {
  const secret = c.env.WEBSITE_APP_PULL_SECRET;
  if (!secret?.trim()) return c.json({ error: 'not-configured' }, 503);
  if (!await authenticated(c.req.header('authorization'), secret)) return c.json({ error: 'unauthorized' }, 401);
  if (c.env.WEBSITE_APP_PULL !== 'on') return c.json({ error: 'not-found' }, 404);
  if (!(await c.env.MF_PULL_RL.limit({ key: 'mf-pull' })).success) return c.json({ error: 'rate-limited' }, 429);
  if (!/^APP-\d{4}-\d{4,}$/.test(c.req.param('no') ?? '')) return c.json({ error: 'not-found' }, 404);
  await purgeExpiredPayloads(c.env.PMES_DB, new Date().toISOString());
  await next();
};

type ApplicationState = { pulled_at: string | null; payload_expired_at: string | null; payload: string | null };

function readState(db: D1Database, no: string): Promise<ApplicationState | null> {
  // Read status and payload together, so a concurrent ack cannot split the observation.
  return db.prepare(`SELECT m.pulled_at, m.payload_expired_at, p.payload
    FROM membership_applications m LEFT JOIN application_payloads p ON p.no = m.no
    WHERE m.no = ?`).bind(no).first<ApplicationState>();
}

function unavailable(state: ApplicationState | null): 'already-pulled' | 'expired' | 'not-found' {
  if (state?.pulled_at) return 'already-pulled';
  if (state?.payload_expired_at) return 'expired';
  return 'not-found';
}

pullRoutes.get('/applications/:no', requirePull, async c => {
  const state = await readState(c.env.PMES_DB, c.req.param('no'));
  if (state?.payload && !state.pulled_at && !state.payload_expired_at) {
    const record = JSON.parse(state.payload) as WebsiteApplicationRecord;
    return c.json({ record });
  }
  const error = unavailable(state);
  return c.json({ error }, error === 'not-found' ? 404 : 410);
});

pullRoutes.post('/applications/:no/ack', requirePull, async c => {
  const no = c.req.param('no');
  if (await deletePayload(c.env.PMES_DB, no, new Date().toISOString())) return c.body(null, 204);
  const error = unavailable(await readState(c.env.PMES_DB, no));
  return c.json({ error }, error === 'not-found' ? 404 : 410);
});
