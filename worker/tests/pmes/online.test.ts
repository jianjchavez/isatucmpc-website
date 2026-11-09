// Standing monthly online session behind PMES_SELF_PACED (board paper Item 3).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../../src/index';
import { hashPassword } from '../../src/pmes/auth';
import { createSession, findOpenSession } from '../../src/pmes/sessions';
import { issueCertificate, getVerification } from '../../src/pmes/certificates';

const ORIGIN = 'https://isatucmpc.coop';
const API = 'https://forms.isatucmpc.coop/api/pmes';
const db = () => env.PMES_DB;

const testEnv = (selfPaced: 'on' | 'off' | undefined) => ({
  ...env,
  PMES_DRAW_STATUS: 'draft',
  PMES_RL: { limit: async () => ({ success: true }) },
  PMES_SESSION_SECRET: 'test-secret',
  PMES_SELF_PACED: selfPaced,
});

const fetchMock = vi.fn(async (_input?: unknown, _init?: unknown) => new Response(JSON.stringify({ success: true })));
vi.stubGlobal('fetch', fetchMock);

function call(path: string, selfPaced: 'on' | 'off' | undefined, body?: unknown, token?: string) {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  return worker.fetch(
    new Request(API + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv(selfPaced),
    {} as any,
  );
}

const session = (sessionDate: string, random?: (n: number) => number) =>
  createSession(db(), { sessionDate, venue: 'Venue', presenterName: 'Presenter Name', chairName: 'Chair Name', presenterId: 1 }, random);
const manilaNow = () => new Date(Date.now() + 8 * 3600e3).toISOString();
const thisMonth = () => manilaNow().slice(0, 7);
const today = () => manilaNow().slice(0, 10);

beforeEach(async () => {
  fetchMock.mockClear();
  await db().batch(
    ['pmes_overrides', 'pmes_certificates', 'pmes_counters', 'pmes_attempts', 'pmes_sessions', 'pmes_presenters'].map(t => db().prepare(`DELETE FROM ${t}`)),
  );
  const { hash, salt } = await hashPassword('pw-1234');
  await db()
    .prepare("INSERT INTO pmes_presenters (id, username, display_name, password_hash, password_salt, created_at) VALUES (1, 'Presenter Name', 'Presenter Name', ?, ?, '2026-10-21T00:00:00Z')")
    .bind(hash, salt)
    .run();
});

async function token(selfPaced: 'on' | 'off' | undefined) {
  const res = await call('/admin/login', selfPaced, { username: 'Presenter Name', password: 'pw-1234' });
  return (await res.json<{ token: string }>()).token;
}

describe('month validity at Manila month boundaries', () => {
  it('a YYYY-MM session is valid from 00:00 on the 1st to 23:59:59 on the last day, Asia/Manila', async () => {
    const row = await session('2026-11');
    // 2026-10-31T15:59:59Z = Oct 31 23:59:59 Manila: still October, the November code is not yet valid.
    expect(await findOpenSession(db(), row.code, '2026-10-31T15:59:59Z', true)).toBe('invalid-code');
    expect(await findOpenSession(db(), row.code, '2026-10-31T16:00:00Z', true)).toMatchObject({ id: row.id });
    expect(await findOpenSession(db(), row.code, '2026-11-15T04:00:00Z', true)).toMatchObject({ id: row.id });
    expect(await findOpenSession(db(), row.code, '2026-11-30T15:59:59Z', true)).toMatchObject({ id: row.id });
    expect(await findOpenSession(db(), row.code, '2026-11-30T16:00:00Z', true)).toBe('code-expired');
  });

  it('crosses the year end in Manila time', async () => {
    const row = await session('2026-12');
    expect(await findOpenSession(db(), row.code, '2026-12-31T15:59:59Z', true)).toMatchObject({ id: row.id });
    expect(await findOpenSession(db(), row.code, '2026-12-31T16:00:00Z', true)).toBe('code-expired');
  });

  it('a closed month session reads as closed', async () => {
    const row = await session('2026-11');
    await db().prepare("UPDATE pmes_sessions SET status = 'closed' WHERE id = ?").bind(row.id).run();
    expect(await findOpenSession(db(), row.code, '2026-11-10T00:00:00Z', true)).toBe('session-closed');
  });

  it('per-day sessions keep their one-day validity with the switch on', async () => {
    const row = await session('2026-11-05');
    expect(await findOpenSession(db(), row.code, '2026-11-04T15:59:59Z', true)).toBe('invalid-code');
    expect(await findOpenSession(db(), row.code, '2026-11-05T15:00:00Z', true)).toMatchObject({ id: row.id });
    expect(await findOpenSession(db(), row.code, '2026-11-05T16:00:01Z', true)).toBe('code-expired');
  });
});

describe('switch off: unchanged', () => {
  it('a month session never opens (expired within its month, unknown before)', async () => {
    const row = await session('2026-11');
    expect(await findOpenSession(db(), row.code, '2026-11-15T04:00:00Z')).toBe('code-expired');
    expect(await findOpenSession(db(), row.code, '2026-11-15T04:00:00Z', false)).toBe('code-expired');
    expect(await findOpenSession(db(), row.code, '2026-10-15T04:00:00Z')).toBe('invalid-code');
  });

  it('GET /online-session is the same 404 as an unknown route, for "off" and for an unset var', async () => {
    await session(thisMonth());
    const unknown = await call('/no-such-route', 'off');
    for (const flag of ['off', undefined] as const) {
      const res = await call('/online-session', flag);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(await unknown.clone().text());
    }
  });

  it('POST /admin/sessions ignores kind=month and still requires a day', async () => {
    const t = await token('off');
    const res = await call('/admin/sessions', 'off', { kind: 'month', month: thisMonth(), venue: 'V', presenterName: 'P', chairName: 'C' }, t);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing-fields' });
    const day = await call('/admin/sessions', 'off', { kind: 'month', sessionDate: '2026-11-20', venue: 'V', presenterName: 'P', chairName: 'C' }, t);
    expect(day.status).toBe(200);
    expect(await day.json()).toMatchObject({ sessionDate: '2026-11-20', venue: 'V' });
  });

  it('/start with a month code answers code-expired', async () => {
    await session(thisMonth(), () => 0);
    const res = await call('/start', 'off', { code: 'PMES-AAAA', idType: 'member', idNumber: 'M-1', fullName: 'Attendee Name', mobile: '09171234567', email: 'a@example.com', consent: true, turnstile: 't' });
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'code-expired' });
  });
});

describe('switch on', () => {
  it('a presenter opens one online session per month; a second is refused', async () => {
    const t = await token('on');
    const body = { kind: 'month', month: '2026-12', presenterName: 'Presenter Name', chairName: 'Chair Name' };
    const res = await call('/admin/sessions', 'on', body, t);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sessionDate: '2026-12', venue: 'isatucmpc.coop (online)', presenterName: 'Presenter Name', chairName: 'Chair Name', status: 'open' });
    const again = await call('/admin/sessions', 'on', body, t);
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'online-session-exists' });
    expect((await call('/admin/sessions', 'on', { ...body, month: '2026-13' }, t)).status).toBe(400);
    expect((await call('/admin/sessions', 'on', { ...body, chairName: '' }, t)).status).toBe(400);
  });

  it('the database refuses a second session for the same month (unique index)', async () => {
    await session('2026-12');
    await expect(db().prepare("INSERT INTO pmes_sessions (code, session_date, venue, presenter_name, chair_name, presenter_id, created_at) VALUES ('PMES-ZZZZ', '2026-12', 'V', 'P', 'C', 1, 'x')").run()).rejects.toThrow(/UNIQUE/);
    // Per-day sessions on one date are still unlimited.
    await session('2026-12-05');
    await session('2026-12-05');
  });

  it('GET /online-session returns this month\'s open code, else 404', async () => {
    expect((await call('/online-session', 'on')).status).toBe(404);
    await session(today()); // a per-day session is not the online one
    const none = await call('/online-session', 'on');
    expect(none.status).toBe(404);
    expect(await none.json()).toEqual({ error: 'no-online-session' });
    const row = await session(thisMonth());
    const res = await call('/online-session', 'on');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: row.code, month: thisMonth() });
    await db().prepare("UPDATE pmes_sessions SET status = 'closed' WHERE id = ?").bind(row.id).run();
    expect((await call('/online-session', 'on')).status).toBe(404);
  });

  it('/start accepts this month\'s online code', async () => {
    await session(thisMonth(), () => 0);
    const res = await call('/start', 'on', { code: 'PMES-AAAA', idType: 'member', idNumber: 'M-1', fullName: 'Attendee Name', mobile: '09171234567', email: 'a@example.com', consent: true, turnstile: 't' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 20, secondsLeft: 30, attemptNo: 1 });
  });

  it('a certificate from a month session shows the Manila day the attempt was submitted', async () => {
    const month = await session('2026-11');
    const day = await session('2026-11-05');
    const attempt = (id: string, sessionId: number, submittedAt: string) => db()
      .prepare(`INSERT INTO pmes_attempts (id, session_id, attempt_no, id_type, id_number, full_name, mobile, email, consent_at, draw_json, score, passed, started_at, submitted_at, status)
        VALUES (?, ?, 1, 'application', 'APP-2026-0001', 'Attendee Name', '09171234567', 'a@example.com', 'x', '[]', 18, 1, 'x', ?, 'submitted')`)
      .bind(id, sessionId, submittedAt).run();
    await attempt('m1', month.id, '2026-11-17T16:30:00.000Z'); // 00:30 on Nov 18 in Manila
    await attempt('d1', day.id, '2026-11-05T03:00:00.000Z');
    const m = await issueCertificate(db(), 'm1', '2026-11-17T16:30:01.000Z');
    const d = await issueCertificate(db(), 'd1', '2026-11-05T03:00:01.000Z');
    expect((await getVerification(db(), m.no))?.sessionDate).toBe('2026-11-18');
    expect((await getVerification(db(), d.no))?.sessionDate).toBe('2026-11-05');
  });
});
