import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { verifyTurnstile } from '../src/turnstile';
import { issueApplicationNo } from '../src/membership/applications';
import { createSession } from '../src/pmes/sessions';
import { applicantFixture } from './fixtures/application-record';

const ORIGIN = 'https://site.example';
const SECRET = 'test-secret&+ =';
const TOKEN = 'test-token&+ =';
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const tables = ['pmes_overrides', 'pmes_certificates', 'pmes_counters', 'pmes_attempts',
  'pmes_sessions', 'pmes_presenters', 'application_payloads', 'membership_applications', 'application_counters'];
const bindings = {
  ...env, SITE_ORIGIN: ORIGIN, TURNSTILE_SECRET: SECRET, RESEND_API_KEY: 'test-key',
  TO_EMAIL: 'office@example.com', PMES_DRAW_STATUS: 'approved', PMES_SELF_PACED: 'on', WEBSITE_APP_PULL: 'on',
  PMES_RL: { limit: async () => ({ success: true }) },
  PMES_RL_IP: { limit: async () => ({ success: true }) },
  PUBLIC_RL: { limit: async () => ({ success: true }) },
};
const snapshot = async () => Promise.all(tables.map(async table =>
  ({ table, rows: (await env.PMES_DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results })));
const outbound = vi.fn<typeof fetch>();
let paths: Record<string, { path: string; body: Record<string, unknown>; tokenField: string }>;

beforeEach(async () => {
  outbound.mockReset().mockRejectedValue(new Error('Unexpected outbound call'));
  vi.stubGlobal('fetch', outbound);
  await env.PMES_DB.batch(tables.map(table => env.PMES_DB.prepare(`DELETE FROM ${table}`)));
  await env.PMES_DB.prepare(`INSERT INTO pmes_presenters
    (id, username, display_name, password_hash, password_salt, created_at)
    VALUES (1, 'Test Presenter', 'Test Presenter', 'unused', 'unused', '2026-01-01T00:00:00Z')`).run();
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const common = { venue: 'Test Hall', presenterName: 'Test Presenter', chairName: 'Test Chair', presenterId: 1 };
  const quiz = await createSession(env.PMES_DB, { ...common, sessionDate: today }, () => 0);
  const attendance = await createSession(env.PMES_DB, { ...common, sessionDate: today, mode: 'attendance' }, () => 1);
  const online = await createSession(env.PMES_DB, { ...common, sessionDate: today.slice(0, 7) }, () => 2);
  const record = { ...applicantFixture(), firstName: 'Test', lastName: 'Member A', email: 'member@example.com' };
  const no = await issueApplicationNo(env.PMES_DB,
    { fullName: 'Test Member A', email: record.email, mobile: record.contactNumber }, new Date().toISOString(), record);
  const contact = { name: 'Test Member A', email: record.email, message: 'Test inquiry', 'cf-turnstile-response': TOKEN };
  const start = { code: quiz.code, idType: 'member', idNumber: 'TEST-A', fullName: 'Test Member A',
    mobile: record.contactNumber, email: record.email, consent: true, turnstile: TOKEN };
  const application = { ...start, idType: 'application', idNumber: no };
  paths = {
    contact: { path: '/api/submit', body: contact, tokenField: 'cf-turnstile-response' },
    membership: { path: '/api/submit', body: { ...contact, 'form-source': 'membership', shares: '500', years: '3', applicant: JSON.stringify(record) }, tokenField: 'cf-turnstile-response' },
    'member quiz': { path: '/api/pmes/start', body: start, tokenField: 'turnstile' },
    'application quiz': { path: '/api/pmes/start', body: application, tokenField: 'turnstile' },
    'face-to-face check-in': { path: '/api/pmes/start', body: { ...application, code: attendance.code }, tokenField: 'turnstile' },
    'online quiz': { path: '/api/pmes/start', body: { ...application, code: online.code }, tokenField: 'turnstile' },
  };
});
afterEach(() => vi.unstubAllGlobals());

describe.each(['contact', 'membership', 'member quiz', 'application quiz', 'face-to-face check-in', 'online quiz'])('%s gate', kind => {
  it.each(['missing token', 'rejected token', 'network error', 'non-JSON response'])('refuses %s without changing any stored rows', async failure => {
    const entry = paths[kind];
    const body = { ...entry.body };
    if (failure === 'missing token') delete body[entry.tokenField];
    else if (failure === 'network error') outbound.mockRejectedValueOnce(new TypeError('Test connection failure'));
    else outbound.mockResolvedValueOnce(failure === 'non-JSON response'
      ? new Response('<html>unavailable</html>', { status: 503 })
      : Response.json({ success: false, 'error-codes': ['invalid-input-response'] }));
    const before = await snapshot();
    const response = await worker.fetch(new Request(`https://worker.example${entry.path}`, {
      method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }), bindings, {} as ExecutionContext);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: failure === 'missing token' ? 'missing-fields' : 'turnstile-failed' });
    expect(await snapshot()).toEqual(before);
    expect(outbound).toHaveBeenCalledTimes(failure === 'missing token' ? 0 : 1);
    if (failure !== 'missing token') {
      const [url, init] = outbound.mock.calls[0];
      expect(url).toBe(SITEVERIFY);
      expect(init?.method).toBe('POST');
      // Start trims user input; the contact route forwards its token unchanged.
      expect(Array.from(new URLSearchParams(String(init?.body)).entries())).toEqual([
        ['secret', SECRET], ['response', entry.path === '/api/submit' ? TOKEN : TOKEN.trim()],
      ]);
    }
  });
});

describe('siteverify response contract', () => {
  it('requires literal boolean success, refusing truthy values and missing properties', async () => {
    for (const response of [{ success: 'true' }, { success: 1 }, {}, null, []]) {
      outbound.mockResolvedValueOnce(Response.json(response));
      expect(await verifyTurnstile(SECRET, TOKEN)).toBe(false);
    }
  });
  it('accepts literal true and form-encodes the exact secret and token', async () => {
    outbound.mockResolvedValueOnce(Response.json({ success: true }));
    expect(await verifyTurnstile(SECRET, TOKEN)).toBe(true);
    const [url, init] = outbound.mock.calls[0];
    expect(url).toBe(SITEVERIFY);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    expect(Array.from((init!.body as URLSearchParams).entries())).toEqual([['secret', SECRET], ['response', TOKEN]]);
  });
  it('refuses a JSON response whose body cannot be read', async () => {
    const response = Response.json({ success: true });
    await response.text();
    outbound.mockResolvedValueOnce(response);
    expect(await verifyTurnstile(SECRET, TOKEN)).toBe(false);
  });
});
