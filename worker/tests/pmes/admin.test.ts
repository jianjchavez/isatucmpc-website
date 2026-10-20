import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../../src/index';
import { hashPassword } from '../../src/pmes/auth';
import { createSession } from '../../src/pmes/sessions';

const ORIGIN = 'https://isatucmpc.coop';
const API = 'https://forms.isatucmpc.coop/api/pmes';
const db = () => env.PMES_DB;

const testEnv = (over: Partial<typeof env> = {}) => ({
  ...env,
  PMES_DRAW_STATUS: 'draft',
  PMES_RL: { limit: async () => ({ success: true }) },
  PMES_SESSION_SECRET: 'test-secret',
  RESEND_API_KEY: 'test-key',
  ...over,
});

// Turnstile siteverify and Resend both answer 200 { success: true }.
const fetchMock = vi.fn(async (_input?: unknown, _init?: unknown) => new Response(JSON.stringify({ success: true })));
vi.stubGlobal('fetch', fetchMock);

const manilaToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

function call(path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  return worker.fetch(
    new Request(API + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv(),
    {} as any,
  );
}

async function login(username = 'Presenter Name', password = 'pw-1234') {
  const res = await call('/admin/login', { username, password });
  const json = res.status === 200 ? await res.clone().json<{ token: string }>() : { token: '' };
  return { res, token: json.token };
}

const insertAttempt = (sessionId: number, no: number, over: Record<string, unknown> = {}) => {
  const r = {
    id: `a${sessionId}-${no}-${Math.random().toString(16).slice(2)}`, id_type: 'application', id_number: 'A-1', full_name: 'Attendee Name',
    mobile: '09171234567', email: 'attendee@example.com', score: null, passed: null, status: 'started', submitted_at: null, ...over,
  };
  return db()
    .prepare(
      `INSERT INTO pmes_attempts (id, session_id, attempt_no, id_type, id_number, full_name, mobile, email, consent_at, draw_json, score, passed, started_at, submitted_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-10-21T00:00:00Z', ?, ?, ?, '2026-10-21T00:00:00Z', ?, ?)`,
    )
    .bind(r.id, sessionId, no, r.id_type, r.id_number, r.full_name, r.mobile, r.email, JSON.stringify(Array(20).fill({ id: 'q', optionOrder: [0, 1, 2, 3] })), r.score, r.passed, r.submitted_at, r.status)
    .run()
    .then(() => r.id);
};

describe('/api/pmes/admin', () => {
  let sessionId: number;
  beforeEach(async () => {
    fetchMock.mockClear();
    await db().batch(
      ['pmes_overrides', 'pmes_certificates', 'pmes_counters', 'pmes_attempts', 'pmes_sessions', 'pmes_presenters'].map(t =>
        db().prepare(`DELETE FROM ${t}`),
      ),
    );
    const { hash, salt } = await hashPassword('pw-1234');
    await db()
      .prepare("INSERT INTO pmes_presenters (id, username, display_name, password_hash, password_salt, created_at) VALUES (1, 'Presenter Name', 'Presenter Name', ?, ?, '2026-10-21T00:00:00Z')")
      .bind(hash, salt)
      .run();
    const row = await createSession(
      db(),
      { sessionDate: manilaToday(), venue: 'Main Hall', presenterName: 'Presenter Name', chairName: 'Chair', presenterId: 1, timerMinutes: 20 },
      () => 0, // PMES-AAAA
    );
    sessionId = row.id;
  });

  it('login returns the presenter, a signed bearer token and its expiry; sets no cookie', async () => {
    const before = Date.now();
    const { res } = await login();
    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.presenter).toEqual({ id: 1, displayName: 'Presenter Name' });
    expect(json.token).toMatch(/^1\.\d+\.[0-9a-f]{64}$/);
    expect(json.expiresAt).toBe(Number(json.token.split('.')[1]));
    expect(json.expiresAt - before).toBeGreaterThanOrEqual(12 * 3600e3);
    expect(json.expiresAt - before).toBeLessThan(12 * 3600e3 + 5000);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('login with a padded, lowercased name succeeds; wrong password and blanks are rejected', async () => {
    expect((await login('  presenter name ')).res.status).toBe(200);
    const wrong = await login('Presenter Name', 'nope');
    expect(wrong.res.status).toBe(401);
    expect(await wrong.res.json()).toEqual({ error: 'invalid-login' });
    expect((await login('Nobody', 'pw-1234')).res.status).toBe(401);
    expect((await login('', 'pw-1234')).res.status).toBe(400);
  });

  it('401 without an Authorization header or with a tampered token; no logout route', async () => {
    const res = await call('/admin/sessions');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    const { token } = await login();
    expect((await call('/admin/sessions', undefined, token.replace(/.$/, c => (c === '0' ? '1' : '0')))).status).toBe(401);
    expect((await call('/admin/logout', {})).status).toBe(404);
  });

  it('lists sessions newest first as AdminSession', async () => {
    const { token } = await login();
    const res = await call('/admin/sessions', undefined, token);
    expect(res.status).toBe(200);
    const { sessions } = await res.json<any>();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: sessionId, code: 'PMES-AAAA', sessionDate: manilaToday(), venue: 'Main Hall', presenterName: 'Presenter Name', chairName: 'Chair', timerMinutes: 20, status: 'open', closedAt: null });
    expect(typeof sessions[0].createdAt).toBe('string');
  });

  it('create requires chairName and returns a code; timer coerced to 0 or 20', async () => {
    const { token } = await login();
    const body = { sessionDate: '2026-10-24', venue: 'Room 2', presenterName: 'Presenter Name', chairName: 'Vice Chair', timerMinutes: 20 };
    let res = await call('/admin/sessions', { ...body, chairName: '' }, token);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing-fields' });
    res = await call('/admin/sessions', { ...body, sessionDate: '24/10/2026' }, token);
    expect(res.status).toBe(400);

    res = await call('/admin/sessions', { ...body, timerMinutes: 0 }, token);
    expect(res.status).toBe(200);
    const s = await res.json<any>();
    expect(s.code).toMatch(/^PMES-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    expect(s).toMatchObject({ sessionDate: '2026-10-24', venue: 'Room 2', chairName: 'Vice Chair', timerMinutes: 0, status: 'open' });
    const row = await db().prepare('SELECT presenter_id FROM pmes_sessions WHERE id = ?').bind(s.id).first<any>();
    expect(row.presenter_id).toBe(1);
  });

  it('close marks the session closed', async () => {
    const { token } = await login();
    const res = await call(`/admin/sessions/${sessionId}/close`, {}, token);
    expect(await res.json()).toEqual({ ok: true });
    const row = await db().prepare('SELECT status, closed_at FROM pmes_sessions WHERE id = ?').bind(sessionId).first<any>();
    expect(row.status).toBe('closed');
    expect(row.closed_at).toBeTruthy();
    expect((await call('/admin/sessions/999/close', {}, token)).status).toBe(404);
  });

  it('override inserts a row and lets a fourth start through; blank reason rejected', async () => {
    const { token } = await login();
    const start = () =>
      call('/start', { code: 'PMES-AAAA', idType: 'application', idNumber: ' a-1 ', fullName: 'Attendee Name', mobile: '09171234567', email: 'a@example.com', consent: true, turnstile: 'tok' });
    for (let i = 0; i < 3; i++) expect((await start()).status).toBe(200);
    expect((await start()).status).toBe(409);

    let res = await call(`/admin/sessions/${sessionId}/override`, { idType: 'application', idNumber: 'a-1', reason: '  ' }, token);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'reason-required' });
    res = await call(`/admin/sessions/${sessionId}/override`, { idType: '', idNumber: 'a-1', reason: 'r' }, token);
    expect(await res.json()).toEqual({ error: 'missing-fields' });

    res = await call(`/admin/sessions/${sessionId}/override`, { idType: 'application', idNumber: ' a-1 ', reason: 'Committee decision' }, token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ extraAttempts: 3 });
    const row = await db().prepare('SELECT * FROM pmes_overrides').first<any>();
    expect(row).toMatchObject({ session_id: sessionId, id_type: 'application', id_number: 'A-1', extra_attempts: 3, reason: 'Committee decision', presenter_id: 1 });
    expect(row.created_at).toBeTruthy();
    const fourth = await start();
    expect(fourth.status).toBe(200);
    expect((await fourth.json<any>()).attemptNo).toBe(4);
  });

  it('roster groups attempts per identity with bestScore, override and totals; CSV quotes and has the BOM', async () => {
    const { token } = await login();
    await insertAttempt(sessionId, 1, { score: 10, passed: 0, status: 'submitted', submitted_at: '2026-10-21T01:00:00Z' });
    await insertAttempt(sessionId, 2, { score: 12, passed: 0, status: 'submitted', submitted_at: '2026-10-21T01:20:00Z' });
    const third = await insertAttempt(sessionId, 3, { score: 17, passed: 1, status: 'submitted', submitted_at: '2026-10-21T01:40:00Z', full_name: 'Name, Attendee' });
    await db().prepare("INSERT INTO pmes_certificates (no, year, seq, attempt_id, key, issued_at, email_status) VALUES ('PMES-2026-0001', 2026, 1, ?, 'k', '2026-10-21T01:40:00Z', 'sent')").bind(third).run();
    await insertAttempt(sessionId, 1, { id_number: 'B-2', full_name: 'another person', email: 'b@example.com', score: 9, passed: 0, status: 'submitted', submitted_at: '2026-10-21T01:00:00Z' });
    await insertAttempt(sessionId, 1, { id_type: 'member', id_number: 'M-3', full_name: 'Zed In Progress' });
    await call(`/admin/sessions/${sessionId}/override`, { idType: 'application', idNumber: 'A-1', reason: 'Second chance' }, token);

    const res = await call(`/admin/sessions/${sessionId}/roster`, undefined, token);
    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.session).toMatchObject({ id: sessionId, code: 'PMES-AAAA' });
    expect(json.rows.map((r: any) => r.fullName)).toEqual(['another person', 'Name, Attendee', 'Zed In Progress']);
    const a1 = json.rows[1];
    expect(a1).toMatchObject({ idType: 'application', idNumber: 'A-1', mobile: '09171234567', email: 'attendee@example.com', bestScore: 17, passed: true, certificateNo: 'PMES-2026-0001', emailStatus: 'sent' });
    expect(a1.attempts.map((a: any) => [a.attemptNo, a.score, a.status])).toEqual([[1, 10, 'submitted'], [2, 12, 'submitted'], [3, 17, 'submitted']]);
    expect(a1.attempts[2]).toMatchObject({ attemptId: third, submittedAt: '2026-10-21T01:40:00Z' });
    expect(a1.overrides).toHaveLength(1);
    expect(a1.overrides[0]).toMatchObject({ reason: 'Second chance', presenterName: 'Presenter Name' });
    expect(json.rows[2]).toMatchObject({ bestScore: null, passed: false, certificateNo: null, emailStatus: null, overrides: [] });
    expect(json.totals).toEqual({ attended: 3, passed: 1, failed: 1 });

    const csv = await call(`/admin/sessions/${sessionId}/roster.csv`, undefined, token);
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(csv.headers.get('content-disposition')).toBe(`attachment; filename="PMES-${manilaToday()}-PMES-AAAA.csv"`);
    const bytes = new Uint8Array(await csv.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM (text() would strip it)
    const lines = new TextDecoder().decode(bytes).trim().split('\r\n');
    expect(lines[0]).toBe('No.,Name,ID type,ID number,Mobile,Email,Attempts,Best score,Result,Certificate No.,Email status,Overrides');
    expect(lines[1]).toBe('1,another person,application,B-2,09171234567,b@example.com,9,9,Failed,,,0');
    expect(lines[2]).toBe('2,"Name, Attendee",application,A-1,09171234567,attendee@example.com,10 / 12 / 17,17,Passed,PMES-2026-0001,sent,1');
    expect(lines[3]).toBe('3,Zed In Progress,member,M-3,09171234567,attendee@example.com,,,In progress,,,0');
  });

  it('resend-email re-sends through Resend and updates the certificate email status', async () => {
    const { token } = await login();
    const id = await insertAttempt(sessionId, 1, { score: 17, passed: 1, status: 'submitted', submitted_at: '2026-10-21T01:40:00Z' });
    await db().prepare("INSERT INTO pmes_certificates (no, year, seq, attempt_id, key, issued_at, email_status) VALUES ('PMES-2026-0001', 2026, 1, ?, 'k', '2026-10-21T01:40:00Z', 'failed')").bind(id).run();
    fetchMock.mockClear();
    const res = await call(`/admin/sessions/${sessionId}/resend-email`, { attemptId: id }, token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ emailStatus: 'sent' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).subject).toContain('PMES-2026-0001');
    const cert = await db().prepare('SELECT email_status FROM pmes_certificates').first<any>();
    expect(cert.email_status).toBe('sent');
    const missing = await call(`/admin/sessions/${sessionId}/resend-email`, { attemptId: 'nope' }, token);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'unknown-attempt' });
  });

  it('resend-email issues the missing certificate for a passed attempt before sending', async () => {
    const { token } = await login();
    const id = await insertAttempt(sessionId, 1, { score: 17, passed: 1, status: 'submitted', submitted_at: '2026-10-21T01:40:00Z' });
    fetchMock.mockClear();
    const res = await call(`/admin/sessions/${sessionId}/resend-email`, { attemptId: id }, token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ emailStatus: 'sent' });
    const cert = await db().prepare('SELECT no, attempt_id, email_status FROM pmes_certificates').first<any>();
    expect(cert).toMatchObject({ no: `PMES-${manilaToday().slice(0, 4)}-0001`, attempt_id: id, email_status: 'sent' });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).subject).toContain(cert.no);
    // A failed attempt gets no certificate.
    const failed = await insertAttempt(sessionId, 1, { id_number: 'B-2', score: 10, passed: 0, status: 'submitted', submitted_at: '2026-10-21T01:40:00Z' });
    expect((await call(`/admin/sessions/${sessionId}/resend-email`, { attemptId: failed }, token)).status).toBe(200);
    expect((await db().prepare('SELECT COUNT(*) AS n FROM pmes_certificates').first<any>()).n).toBe(1);
  });
});

describe('hardening', () => {
  it('rate limits login per IP', async () => {
    const res = await worker.fetch(
      new Request('https://forms.isatucmpc.coop/api/pmes/admin/login', {
        method: 'POST',
        headers: { origin: 'https://isatucmpc.coop', 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'Presenter Name', password: 'pw-1234' }),
      }),
      testEnv({ PMES_RL: { limit: async () => ({ success: false }) } }),
      {} as any,
    );
    expect(res.status).toBe(429);
  });

  it('neutralizes formula-leading CSV cells', async () => {
    const { rosterCsv } = await import('../../src/pmes/roster');
    const row = {
      idType: 'application', idNumber: '=1+1', fullName: '@cmd', mobile: '09171234567', email: 'a@b.c',
      attempts: [], bestScore: null, passed: false, certificateNo: null, emailStatus: null, overrides: [],
    } as any;
    const line = rosterCsv([row]).split('\r\n')[1];
    expect(line).toContain(`"'@cmd"`);
    expect(line).toContain(`"'=1+1"`);
  });
});
