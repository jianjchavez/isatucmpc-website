import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../../src/index';
import { signSession } from '../../src/pmes/auth';
import { checkIn } from '../../src/pmes/attendance';
import { issueCertificate } from '../../src/pmes/certificates';
import { createSession, type SessionRow } from '../../src/pmes/sessions';
import { attemptLimit } from '../../src/pmes/validate';
import { applicantFixture } from '../fixtures/application-record';

const NOW = '2026-11-21T02:00:00.000Z';
const tables = ['pmes_overrides', 'pmes_certificates', 'pmes_counters', 'pmes_attempts',
  'pmes_sessions', 'pmes_presenters', 'application_payloads', 'membership_applications', 'application_counters'];
const bindings = {
  ...env, SITE_ORIGIN: 'https://site.example', SITE_URL: 'https://site.example',
  TURNSTILE_SECRET: 'test-secret', RESEND_API_KEY: 'test-key', TO_EMAIL: 'office@example.com',
  PMES_SESSION_SECRET: 'test-session-secret', WEBSITE_APP_PULL: 'on', PMES_DRAW_STATUS: 'approved',
  PMES_RL: { limit: async () => ({ success: true }) },
  PMES_RL_IP: { limit: async () => ({ success: true }) },
  PUBLIC_RL: { limit: async () => ({ success: true }) },
};
const outbound = vi.fn<typeof fetch>();
let session: SessionRow;
let token: string;
const person = { idType: 'member', idNumber: 'TEST-A', fullName: 'Test Member A', mobile: '09171234567', email: 'member@example.com' };
const input = { sessionDate: '2026-11-21', venue: 'Test Hall', presenterName: 'Test Presenter', chairName: 'Test Chair', presenterId: 1, mode: 'attendance' as const };
const record = () => ({ ...applicantFixture(), firstName: 'Test', lastName: 'Member A', email: person.email });
const snapshot = async () => Promise.all(tables.map(async table =>
  ({ table, rows: (await env.PMES_DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results })));
function request(path: string, raw: string | undefined, authorization?: string, overrides = {}) {
  return worker.fetch(new Request(`https://worker.example/api/pmes${path}`, {
    method: raw === undefined ? 'GET' : 'POST',
    headers: { origin: bindings.SITE_ORIGIN, 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
    body: raw,
  }), { ...bindings, ...overrides }, {} as ExecutionContext);
}
const post = (path: string, body: unknown, auth?: string, overrides = {}) => request(path, JSON.stringify(body), auth, overrides);
const startBody = (patch = {}) => ({ ...person, code: session.code, consent: true, turnstile: 'test-token', ...patch });
const adminPath = (suffix: string) => `/admin/sessions/${session.id}/${suffix}`;
async function checkedIn(s = session, idNumber = person.idNumber) {
  await checkIn(env.PMES_DB, s, { ...person, idNumber }, NOW);
  return (await env.PMES_DB.prepare('SELECT id FROM pmes_attempts WHERE session_id = ? AND id_number = ?')
    .bind(s.id, idNumber).first<{ id: string }>())!.id;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  outbound.mockReset().mockImplementation(async input => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return Response.json({ success: true });
    if (url === 'https://api.resend.com/emails') return Response.json({ id: 'test-email' });
    throw new Error('Unexpected outbound URL');
  });
  vi.stubGlobal('fetch', outbound);
  await env.PMES_DB.batch(tables.map(table => env.PMES_DB.prepare(`DELETE FROM ${table}`)));
  await env.PMES_DB.prepare(`INSERT INTO pmes_presenters
    (id, username, display_name, password_hash, password_salt, created_at)
    VALUES (1, 'Test Presenter', 'Test Presenter', 'unused', 'unused', ?)`).bind(NOW).run();
  session = await createSession(env.PMES_DB, input, () => 0);
  token = `Bearer ${await signSession(1, Date.parse(NOW) + 3600_000, bindings.PMES_SESSION_SECRET)}`;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('PMES input boundary', () => {
  it.each([
    [{ code: ['PMES-AAAA'] }, 'missing-fields'],
    [{ mobile: 9171234567 }, 'missing-fields'],
    [{ email: ['member@example.com'] }, 'missing-fields'],
    [{ consent: 'true' }, 'consent-required'],
    [{ consent: 1 }, 'consent-required'],
  ])('refuses type-confused sign-up input %# before external calls or writes', async (patch, error) => {
    const before = await snapshot();
    const response = await post('/start', startBody(patch));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(await snapshot()).toEqual(before);
    expect(outbound).not.toHaveBeenCalled();
  });
  it('refuses malformed JSON without any side effects', async () => {
    const before = await snapshot();
    const response = await request('/start', '{');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'missing-fields' });
    expect(await snapshot()).toEqual(before);
    expect(outbound).not.toHaveBeenCalled();
  });
  // Regression: JSON null must return a validation 400 instead of dereferencing raw.code.
  it('refuses a JSON null start body as a client error', async () => {
    const before = await snapshot();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await post('/start', null);
    expect(await snapshot()).toEqual(before);
    expect(outbound).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'missing-fields' });
  });
  it.each([0, 'test', true, [], [{}]].map(body => ({ body })))('refuses a non-object start body %# without side effects', async ({ body }) => {
    const before = await snapshot();
    const response = await post('/start', body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'missing-fields' });
    expect(await snapshot()).toEqual(before);
    expect(outbound).not.toHaveBeenCalled();
  });
  it.each([
    ['/admin/login', 400, 'missing-fields'],
    ['/admin/sessions', 400, 'missing-fields'],
    ['override', 400, 'missing-fields'],
    ['resend-email', 404, 'unknown-attempt'],
    ['confirm', 400, 'missing-fields'],
    ['walk-in', 400, 'invalid-applicant'],
  ] as const)('treats non-object bodies as empty input for %s without side effects', async (path, status, error) => {
    const before = await snapshot();
    for (const body of [{}, null, 0, 'test', true, [], [{}]]) {
      const response = await post(path.startsWith('/') ? path : adminPath(path), body, token);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
      expect(await snapshot()).toEqual(before);
      expect(outbound).not.toHaveBeenCalled();
    }
  });
});

describe('attempt allowance isolation', () => {
  it('uses the configured base when no overrides exist', async () => {
    expect(await attemptLimit(env.PMES_DB, session.id, 'member', 'TEST-A', 2)).toBe(2);
  });
  it('adds multiple overrides only for the exact session, ID kind and ID number', async () => {
    const other = await createSession(env.PMES_DB, input, () => 1);
    for (const [sessionId, type, id] of [
      [session.id, 'member', 'TEST-A'], [session.id, 'member', 'TEST-A'],
      [other.id, 'member', 'TEST-A'], [session.id, 'application', 'TEST-A'], [session.id, 'member', 'TEST-B'],
    ]) {
      await env.PMES_DB.prepare(`INSERT INTO pmes_overrides
        (session_id, id_type, id_number, extra_attempts, reason, presenter_id, created_at)
        VALUES (?, ?, ?, 3, 'Test allowance', 1, ?)`).bind(sessionId, type, id, NOW).run();
    }
    expect(await attemptLimit(env.PMES_DB, session.id, 'member', 'TEST-A', 2)).toBe(8);
    expect(await attemptLimit(env.PMES_DB, other.id, 'member', 'TEST-A', 2)).toBe(5);
    expect(await attemptLimit(env.PMES_DB, session.id, 'application', 'TEST-A', 2)).toBe(5);
    expect(await attemptLimit(env.PMES_DB, session.id, 'member', 'TEST-B', 2)).toBe(5);
    expect(await attemptLimit(env.PMES_DB, session.id, 'member', 'TEST-C', 2)).toBe(2);
  });
});

describe('attendance and presenter boundaries', () => {
  it('protects every session admin operation without leaking seeded data or changing rows', async () => {
    const id = await checkedIn();
    const before = await snapshot();
    const routes: Array<[string, unknown | undefined]> = [
      ['/admin/sessions', undefined], ['/admin/sessions', input],
      [adminPath('roster'), undefined], [adminPath('roster.csv'), undefined], [adminPath('certificates'), undefined],
      [adminPath('close'), {}], [adminPath('override'), { idType: 'member', idNumber: person.idNumber, reason: 'Test reason' }],
      [adminPath('resend-email'), { attemptId: id }], [adminPath('confirm'), { attemptIds: [id] }],
      [adminPath('walk-in'), { applicant: JSON.stringify(record()) }],
    ];
    for (const [path, body] of routes) {
      const response = await request(path, body === undefined ? undefined : JSON.stringify(body));
      expect(response.status, path).toBe(401);
      expect(await response.json()).toEqual({ error: 'unauthorized' });
    }
    expect(await snapshot()).toEqual(before);
    expect(outbound).not.toHaveBeenCalled();
  });
  it('concurrent check-ins record one attendance row with no quiz or certificate', async () => {
    const results = await Promise.all([checkIn(env.PMES_DB, session, person, NOW), checkIn(env.PMES_DB, session, person, NOW)]);
    expect(results).toEqual(Array(2).fill({ checkedIn: true, fullName: person.fullName, confirmed: false }));
    expect((await env.PMES_DB.prepare('SELECT id_number, status, draw_json, score, passed FROM pmes_attempts').all()).results)
      .toEqual([{ id_number: person.idNumber, status: 'attended', draw_json: '[]', score: null, passed: null }]);
    expect((await env.PMES_DB.prepare('SELECT * FROM pmes_certificates').all()).results).toEqual([]);
    expect(outbound).not.toHaveBeenCalled();
  });
  it('confirmation ignores foreign-session IDs, duplicates, missing IDs and non-string values', async () => {
    const own = await checkedIn();
    const other = await createSession(env.PMES_DB, input, () => 1);
    const foreign = await checkedIn(other, 'TEST-B');
    const foreignBefore = await env.PMES_DB.prepare('SELECT * FROM pmes_attempts WHERE id = ?').bind(foreign).first();
    const response = await post(adminPath('confirm'), { attemptIds: [foreign, own, own, 'absent', 7] }, token);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ issued: [{ attemptId: own, certificateNo: 'PMES-2026-0001', emailStatus: 'sent' }] });
    expect(await env.PMES_DB.prepare('SELECT * FROM pmes_attempts WHERE id = ?').bind(foreign).first()).toEqual(foreignBefore);
    expect((await env.PMES_DB.prepare('SELECT attempt_id FROM pmes_certificates').all()).results).toEqual([{ attempt_id: own }]);
    expect(outbound).toHaveBeenCalledTimes(2);
  });
  it('concurrent confirmations issue and email a certificate only once', async () => {
    const id = await checkedIn();
    const responses = await Promise.all([post(adminPath('confirm'), { attemptIds: [id] }, token), post(adminPath('confirm'), { attemptIds: [id] }, token)]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const bodies = await Promise.all(responses.map(r => r.json<{ issued: unknown[] }>()));
    expect(bodies.flatMap(b => b.issued)).toEqual([{ attemptId: id, certificateNo: 'PMES-2026-0001', emailStatus: 'sent' }]);
    expect((await env.PMES_DB.prepare('SELECT no, attempt_id FROM pmes_certificates').all()).results)
      .toEqual([{ no: 'PMES-2026-0001', attempt_id: id }]);
    expect(outbound).toHaveBeenCalledTimes(2);
  });
  it('a closed attendance session refuses a public check-in without storing an attempt', async () => {
    await env.PMES_DB.prepare("UPDATE pmes_sessions SET status = 'closed' WHERE id = ?").bind(session.id).run();
    const before = await snapshot();
    const response = await post('/start', startBody());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'session-closed' });
    expect(await snapshot()).toEqual(before);
    expect(outbound).toHaveBeenCalledTimes(1); // Only the stubbed siteverify call.
  });
  it('a closed attendance session refuses staff walk-ins before allocating an application', async () => {
    await env.PMES_DB.prepare("UPDATE pmes_sessions SET status = 'closed' WHERE id = ?").bind(session.id).run();
    const before = await snapshot();
    const response = await post(adminPath('walk-in'), { applicant: JSON.stringify(record()) }, token);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'not-attendance-session' });
    expect(await snapshot()).toEqual(before);
    expect(outbound).not.toHaveBeenCalled();
  });
  it('walk-ins with pulling disabled retain a summary and attendance but no full payload', async () => {
    const response = await post(adminPath('walk-in'), { applicant: JSON.stringify(record()) }, token, { WEBSITE_APP_PULL: 'off' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ applicationNo: 'APP-2026-0001', fullName: 'Test Member A' });
    expect((await env.PMES_DB.prepare('SELECT no, full_name, mobile, email FROM membership_applications').all()).results)
      .toEqual([{ no: 'APP-2026-0001', full_name: person.fullName, mobile: person.mobile, email: person.email }]);
    expect((await env.PMES_DB.prepare('SELECT id_number, status, draw_json FROM pmes_attempts').all()).results)
      .toEqual([{ id_number: 'APP-2026-0001', status: 'attended', draw_json: '[]' }]);
    expect((await env.PMES_DB.prepare('SELECT * FROM application_payloads').all()).results).toEqual([]);
    expect(outbound).not.toHaveBeenCalled();
  });
});

describe('allocation conflicts', () => {
  it('concurrent issuers for the same attempt return the same certificate and capability key', async () => {
    const id = await checkedIn();
    await env.PMES_DB.prepare("UPDATE pmes_attempts SET passed = 1, status = 'submitted', submitted_at = ? WHERE id = ?").bind(NOW, id).run();
    const certificates = await Promise.all(Array.from({ length: 5 }, () => issueCertificate(env.PMES_DB, id, NOW)));
    expect(certificates[0].no).toMatch(/^PMES-2026-\d{4}$/);
    expect(certificates[0].key).toMatch(/^[0-9a-f]{32}$/);
    expect(certificates).toEqual(Array(5).fill(certificates[0]));
    expect((await env.PMES_DB.prepare('SELECT no, key, attempt_id FROM pmes_certificates').all()).results)
      .toEqual([{ ...certificates[0], attempt_id: id }]);
    expect(await issueCertificate(env.PMES_DB, id, '2027-01-01T00:00:00Z')).toEqual(certificates[0]);
  });
  it('fails after 20 colliding code candidates without altering the existing session', async () => {
    const before = await snapshot();
    const random = vi.fn(() => 0);
    await expect(createSession(env.PMES_DB, input, random)).rejects.toThrow('could not allocate a unique session code');
    expect(random).toHaveBeenCalledTimes(80); // Four characters per candidate, 20 bounded retries.
    expect(await snapshot()).toEqual(before);
  });
});
