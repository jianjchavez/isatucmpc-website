// PMES quiz API, mounted at /api/pmes (spec §5).
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { PmesEnv } from './env';
import { loadBank } from './bank';
import { drawQuiz, presentDraw } from './draw';
import { findOpenSession } from './sessions';
import { isEmail, attemptLimit } from './validate';
import { verifyTurnstile } from '../turnstile';
import { submit } from './submit';
import { admin } from './admin';
import { findApplication, normalizeMobile } from '../membership/applications';
import { QUESTION_SECONDS, type Step } from './flow';

export const pmes = new Hono<{ Bindings: PmesEnv }>();

const allowedOrigins = (env: PmesEnv) => env.SITE_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);

pmes.use(
  '*',
  cors({
    origin: (origin, c) => (allowedOrigins(c.env).includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['content-type', 'authorization'],
    maxAge: 86400,
  }),
);

pmes.post('*', async (c, next) => {
  const origin = c.req.header('origin');
  if (!origin || !allowedOrigins(c.env).includes(origin)) return c.json({ error: 'forbidden' }, 403);
  await next();
});

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const hexId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

type StartBody = { code: string; idType: string; idNumber: string; fullName: string; mobile: string; email: string; consent: unknown; turnstile: string };

pmes.post('/start', async c => {
  const raw: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const b: StartBody = {
    code: str(raw.code).toUpperCase(),
    idType: str(raw.idType),
    idNumber: str(raw.idNumber).toUpperCase(),
    fullName: str(raw.fullName),
    mobile: str(raw.mobile),
    email: str(raw.email).toLowerCase(),
    consent: raw.consent,
    turnstile: str(raw.turnstile),
  };
  if (!b.code || !b.idNumber || !b.mobile || !b.turnstile || !['application', 'member'].includes(b.idType))
    return c.json({ error: 'missing-fields' }, 400);
  if (b.idType === 'member') {
    if (!b.fullName || !b.email) return c.json({ error: 'missing-fields' }, 400);
    b.mobile = normalizeMobile(b.mobile);
    if (!b.mobile) return c.json({ error: 'invalid-mobile' }, 400);
    if (!isEmail(b.email)) return c.json({ error: 'invalid-email' }, 400);
  }
  if (b.consent !== true) return c.json({ error: 'consent-required' }, 400);

  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  // Keyed per IP and identity so one venue NAT does not trip it (Turnstile covers bots; the attempt limit bounds each identity).
  // Per identity (10/min) so a shared venue address is not starved, plus a looser per-IP bucket (60/min).
  const perIdentity = c.env.PMES_RL.limit({ key: `${ip}:${b.idType}:${b.idNumber}` });
  const perIp = c.env.PMES_RL_IP.limit({ key: ip });
  if (!(await perIdentity).success || !(await perIp).success) return c.json({ error: 'rate-limited' }, 429);
  if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET, b.turnstile))) return c.json({ error: 'turnstile-failed' }, 400);

  const now = new Date();
  const nowIso = now.toISOString();
  const session = await findOpenSession(c.env.PMES_DB, b.code, nowIso);
  if (session === 'invalid-code') return c.json({ error: session }, 400);
  if (session === 'session-closed') return c.json({ error: session }, 409);
  if (session === 'code-expired') return c.json({ error: session }, 410);

  const db = c.env.PMES_DB;
  if (b.idType === 'application') {
    const application = await findApplication(db, b.idNumber);
    const mobile = normalizeMobile(b.mobile);
    if (!application || !mobile || mobile !== application.mobile) return c.json({ error: 'unknown-application' }, 400);
    b.fullName = application.fullName;
    b.email = application.email;
    b.mobile = mobile;
  }
  const prior = await db
    .prepare('SELECT COUNT(*) AS n, MAX(passed) AS passed FROM pmes_attempts WHERE session_id = ? AND id_type = ? AND id_number = ?')
    .bind(session.id, b.idType, b.idNumber)
    .first<{ n: number; passed: number | null }>();
  const count = prior?.n ?? 0;
  if (prior?.passed === 1) return c.json({ error: 'already-passed' }, 409);
  const limit = await attemptLimit(db, session.id, b.idType, b.idNumber, Number(c.env.PMES_MAX_ATTEMPTS) || 3);
  if (count >= limit) return c.json({ error: 'attempts-exhausted' }, 409);

  const bank = loadBank(c.env.PMES_DRAW_STATUS === 'draft' ? 'draft' : 'approved');
  const perSection = Math.max(1, Math.round((Number(c.env.PMES_QUIZ_SIZE) || 20) / bank.sections.length));
  let draw;
  try {
    draw = drawQuiz(bank, perSection);
  } catch (err) {
    if (/^bank-too-small:/.test(String((err as Error).message))) return c.json({ error: 'bank-not-ready' }, 503);
    throw err;
  }

  const attemptId = hexId();
  const attemptNo = count + 1;
  try {
    await db
      .prepare(
        `INSERT INTO pmes_attempts (id, session_id, attempt_no, id_type, id_number, full_name, mobile, email, consent_at, draw_json, started_at, deadline_at, status, current_n, served_at, answers_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'started', 1, ?, ?)`,
      )
      .bind(attemptId, session.id, attemptNo, b.idType, b.idNumber, b.fullName, b.mobile, b.email, nowIso, JSON.stringify(draw.items), nowIso, nowIso, JSON.stringify(Array(draw.items.length).fill(null)))
      .run();
  } catch (err) {
    // Two concurrent starts for one identity both computed attempt_no N; the loser hits the UNIQUE constraint.
    if (/UNIQUE/.test(String((err as Error).message))) return c.json({ error: 'attempts-exhausted' }, 409);
    throw err;
  }

  const step: Step = { attemptId, fullName: b.fullName, total: draw.items.length, question: presentDraw(bank, draw)[0], secondsLeft: QUESTION_SECONDS };
  return c.json({ ...step, attemptNo });
});

pmes.route('/', submit);
pmes.route('/admin', admin);
