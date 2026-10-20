// Presenter (admin) routes, mounted at /api/pmes/admin (spec §3.1, §5 Admin).
import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { ADMIN_COOKIE, findPresenterByName, hashPassword, verifyPassword, signSession, requirePresenter, type PresenterApp } from './auth';
import { createSession, closeSession, type SessionRow } from './sessions';
import { attemptLimit } from './validate';
import { sendResultEmails, type AttemptRow } from './email';
import { buildRoster, rosterCsv } from './roster';

export const admin = new Hono<PresenterApp>();

const SESSION_HOURS = 12;
const cookieOpts = { httpOnly: true, secure: true, sameSite: 'None' as const, path: '/api/pmes/admin' };
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const json = (c: { req: { json<T>(): Promise<T> } }) => c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
// Verified against when the presenter name is unknown, so a miss costs the same time as a wrong password.
const dummy = hashPassword('dummy');

export type AdminSession = {
  id: number; code: string; sessionDate: string; venue: string; presenterName: string; chairName: string;
  timerMinutes: number; status: string; createdAt: string; closedAt: string | null;
};
const toAdminSession = (s: SessionRow): AdminSession => ({
  id: s.id, code: s.code, sessionDate: s.session_date, venue: s.venue, presenterName: s.presenter_name, chairName: s.chair_name,
  timerMinutes: s.timer_minutes, status: s.status, createdAt: s.created_at, closedAt: s.closed_at,
});

admin.post('/login', async c => {
  const raw = await json(c);
  const username = str(raw.username);
  const password = typeof raw.password === 'string' ? raw.password : '';
  if (!username || !password) return c.json({ error: 'missing-fields' }, 400);
  const presenter = await findPresenterByName(c.env.PMES_DB, username);
  const { hash, salt } = presenter ? { hash: presenter.password_hash, salt: presenter.password_salt } : await dummy;
  if (!(await verifyPassword(password, hash, salt)) || !presenter) return c.json({ error: 'invalid-login' }, 401);
  const value = await signSession(presenter.id, Date.now() + SESSION_HOURS * 3600e3, c.env.PMES_SESSION_SECRET);
  setCookie(c, ADMIN_COOKIE, value, { ...cookieOpts, maxAge: SESSION_HOURS * 3600 });
  return c.json({ presenter: { id: presenter.id, displayName: presenter.display_name } });
});

admin.post('/logout', c => {
  deleteCookie(c, ADMIN_COOKIE, cookieOpts);
  return c.json({ ok: true });
});

admin.use('/sessions', requirePresenter);
admin.use('/sessions/*', requirePresenter);

admin.get('/sessions', async c => {
  const { results } = await c.env.PMES_DB.prepare('SELECT * FROM pmes_sessions ORDER BY session_date DESC, id DESC').all<SessionRow>();
  return c.json({ sessions: results.map(toAdminSession) });
});

admin.post('/sessions', async c => {
  const raw = await json(c);
  const input = { sessionDate: str(raw.sessionDate), venue: str(raw.venue), presenterName: str(raw.presenterName), chairName: str(raw.chairName) };
  if (!input.venue || !input.presenterName || !input.chairName || !/^\d{4}-\d{2}-\d{2}$/.test(input.sessionDate))
    return c.json({ error: 'missing-fields' }, 400);
  const row = await createSession(c.env.PMES_DB, {
    ...input,
    presenterId: c.var.presenter.id,
    timerMinutes: Number(raw.timerMinutes) === 0 ? 0 : 20,
  });
  return c.json(toAdminSession(row));
});

const loadSession = (db: D1Database, id: string) =>
  /^\d+$/.test(id) ? db.prepare('SELECT * FROM pmes_sessions WHERE id = ?').bind(Number(id)).first<SessionRow>() : Promise.resolve(null);

admin.post('/sessions/:id/close', async c => {
  const s = await loadSession(c.env.PMES_DB, c.req.param('id'));
  if (!s) return c.json({ error: 'not-found' }, 404);
  await closeSession(c.env.PMES_DB, s.id, new Date().toISOString());
  return c.json({ ok: true });
});

admin.post('/sessions/:id/override', async c => {
  const s = await loadSession(c.env.PMES_DB, c.req.param('id'));
  if (!s) return c.json({ error: 'not-found' }, 404);
  const raw = await json(c);
  const idType = str(raw.idType);
  const idNumber = str(raw.idNumber).toUpperCase();
  if (!idType || !idNumber) return c.json({ error: 'missing-fields' }, 400);
  const reason = str(raw.reason);
  if (!reason) return c.json({ error: 'reason-required' }, 400);
  await c.env.PMES_DB.prepare(
    'INSERT INTO pmes_overrides (session_id, id_type, id_number, extra_attempts, reason, presenter_id, created_at) VALUES (?, ?, ?, 3, ?, ?, ?)',
  )
    .bind(s.id, idType, idNumber, reason, c.var.presenter.id, new Date().toISOString())
    .run();
  return c.json({ extraAttempts: 3 });
});

admin.post('/sessions/:id/resend-email', async c => {
  const s = await loadSession(c.env.PMES_DB, c.req.param('id'));
  if (!s) return c.json({ error: 'not-found' }, 404);
  const db = c.env.PMES_DB;
  const attempt = await db
    .prepare(
      `SELECT a.*, s.session_date, s.code, s.presenter_name FROM pmes_attempts a JOIN pmes_sessions s ON s.id = a.session_id
       WHERE a.id = ? AND a.session_id = ? AND a.score IS NOT NULL`,
    )
    .bind(str((await json(c)).attemptId), s.id)
    .first<AttemptRow>();
  if (!attempt) return c.json({ error: 'unknown-attempt' }, 404);
  const [used, limit, certificate] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM pmes_attempts WHERE session_id = ? AND id_type = ? AND id_number = ?').bind(s.id, attempt.id_type, attempt.id_number).first<{ n: number }>(),
    attemptLimit(db, s.id, attempt.id_type, attempt.id_number, Number(c.env.PMES_MAX_ATTEMPTS) || 3),
    db.prepare('SELECT no, key FROM pmes_certificates WHERE attempt_id = ?').bind(attempt.id).first<{ no: string; key: string }>(),
  ]);
  const result = { score: attempt.score!, total: JSON.parse(attempt.draw_json).length, passed: attempt.passed === 1, retakesLeft: Math.max(0, limit - (used?.n ?? 0)) };
  const emailStatus = await sendResultEmails(c.env, attempt, result, certificate);
  if (certificate) await db.prepare('UPDATE pmes_certificates SET email_status = ? WHERE no = ?').bind(emailStatus, certificate.no).run();
  return c.json({ emailStatus });
});

admin.get('/sessions/:id/roster', async c => {
  const s = await loadSession(c.env.PMES_DB, c.req.param('id'));
  if (!s) return c.json({ error: 'not-found' }, 404);
  const { rows, totals } = await buildRoster(c.env.PMES_DB, s.id);
  return c.json({ session: toAdminSession(s), rows, totals });
});

admin.get('/sessions/:id/roster.csv', async c => {
  const s = await loadSession(c.env.PMES_DB, c.req.param('id'));
  if (!s) return c.json({ error: 'not-found' }, 404);
  const { rows } = await buildRoster(c.env.PMES_DB, s.id);
  return c.body(rosterCsv(rows), 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="PMES-${s.session_date}-${s.code}.csv"`,
  });
});
