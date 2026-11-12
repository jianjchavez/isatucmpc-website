import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env as testEnv } from 'cloudflare:test';
import { getApplicationPayload } from '../src/membership/applications';
import { applicantFixture } from './fixtures/application-record';
import worker from '../src/index';
import { PDFDocument } from 'pdf-lib';

const env = {
  SITE_ORIGIN: 'https://isatucmpc.coop,https://isatucmpc.pages.dev',
  TO_EMAIL: 'isatucmpc1964@gmail.com',
  RESEND_API_KEY: 'test-key',
  TURNSTILE_SECRET: 'test-secret',
};

describe('forms worker', () => {
  it('rejects non-POST', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', { method: 'GET' }), env, {} as any);
    expect(res.status).toBe(405);
  });
  it('answers CORS preflight from allowed origin with 204 + ACAO', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'OPTIONS',
      headers: {
        'origin': 'https://isatucmpc.pages.dev',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    }), env, {} as any);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://isatucmpc.pages.dev');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });
  it('CORS preflight from disallowed origin returns no ACAO', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'OPTIONS',
      headers: {
        'origin': 'https://evil.example.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    }), env, {} as any);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('actual POST response includes ACAO for allowed origin', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'POST',
      headers: { 'origin': 'https://isatucmpc.pages.dev', 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    }), env, {} as any);
    expect(res.status).toBe(400);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://isatucmpc.pages.dev');
  });
  it('rejects cross-origin requests', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'POST',
      headers: { 'origin': 'https://evil.example.com', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X', email: 'x@x.com', message: 'spam', 'cf-turnstile-response': 't' }),
    }), env, {} as any);
    expect(res.status).toBe(403);
  });
  it('rejects requests with no Origin header', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X', email: 'x@x.com', message: 'spam', 'cf-turnstile-response': 't' }),
    }), env, {} as any);
    expect(res.status).toBe(403);
  });
  it('accepts isatucmpc.coop origin (custom domain)', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'POST',
      headers: { 'origin': 'https://isatucmpc.coop', 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    }), env, {} as any);
    expect(res.status).not.toBe(403);
  });
  it('accepts isatucmpc.pages.dev origin (pre-cutover)', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'POST',
      headers: { 'origin': 'https://isatucmpc.pages.dev', 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    }), env, {} as any);
    expect(res.status).not.toBe(403);
  });
  it('rejects missing fields', async () => {
    const res = await worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'POST',
      headers: { 'origin': 'https://isatucmpc.coop', 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    }), env, {} as any);
    expect(res.status).toBe(400);
  });
});

// Full membership submission boundary: all validation precedes external calls and writes.
describe('structured membership submissions', () => {
  beforeEach(async () => {
    await testEnv.PMES_DB.batch([
      testEnv.PMES_DB.prepare('DELETE FROM application_payloads'),
      testEnv.PMES_DB.prepare('DELETE FROM membership_applications'),
      testEnv.PMES_DB.prepare('DELETE FROM application_counters'),
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  function submitRecord(raw: unknown, flag?: string, extra = {}) {
    return worker.fetch(new Request('https://forms.isatucmpc.coop/api/submit', {
      method: 'POST', headers: { origin: env.SITE_ORIGIN.split(',')[0], 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Fixture Applicant', email: 'fixture@example.com', message: 'Fixture application',
        shares: '500', years: '5', 'cf-turnstile-response': 'token', 'form-source': 'membership', applicant: raw, ...extra }),
    }), { ...env, PMES_DB: testEnv.PMES_DB, WEBSITE_APP_PULL: flag }, {} as any);
  }
  function externalCalls() {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async input =>
      Response.json(String(input instanceof Request ? input.url : input).includes('turnstile') ? { success: true } : { id: 'fixture-email' }));
  }
  it.each(['on', 'off', undefined, 'ON'])('stores only with exact on switch: %s', async flag => {
    externalCalls();
    const res = await submitRecord(JSON.stringify({ ...applicantFixture(), version: 99, applicationNo: 'forged', submittedAt: 'forged' }), flag);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; applicationNo: string };
    expect(body).toEqual({ ok: true, applicationNo: expect.stringMatching(/^APP-\d{4}-0001$/) });
    expect(await testEnv.PMES_DB.prepare('SELECT COUNT(*) AS n FROM application_payloads').first())
      .toEqual({ n: flag === 'on' ? 1 : 0 });
    const payload = await getApplicationPayload(testEnv.PMES_DB, body.applicationNo);
    if (flag === 'on') {
      expect(payload).toEqual({ ...applicantFixture(), version: 1, applicationNo: body.applicationNo, submittedAt: expect.any(String) });
      const row = await testEnv.PMES_DB.prepare('SELECT created_at FROM membership_applications WHERE no = ?').bind(body.applicationNo).first();
      expect(payload?.submittedAt).toBe(row?.created_at);
    } else {
      expect(payload).toBeNull(); // Turning on later cannot recover an application sent while off.
    }
  });
  it.each(['off', 'on'])('accepts cached nine-field forms without storing a payload with switch %s', async flag => {
    const sent: Array<{ attachments?: Array<{ content: string }> }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input instanceof Request ? input.url : input).includes('turnstile')) {
        return Response.json({ success: true });
      }
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ id: 'fixture-email' });
    });
    const legacy = { firstName: 'Fixture', middleName: '', lastName: 'Applicant', extension: '',
      civilStatus: 'Married', spouseName: 'Fixture Spouse', contactNumber: '+63 917 123 4567',
      address: 'Fixture address', privacyConsent: true };
    const res = await submitRecord(JSON.stringify(legacy), flag);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; applicationNo: string };
    expect(body).toEqual({ ok: true, applicationNo: expect.stringMatching(/^APP-\d{4}-0001$/) });
    expect(await testEnv.PMES_DB.prepare('SELECT mobile FROM membership_applications WHERE no = ?')
      .bind(body.applicationNo).first()).toEqual({ mobile: '09171234567' });
    expect(await testEnv.PMES_DB.prepare('SELECT COUNT(*) AS n FROM application_payloads').first()).toEqual({ n: 0 });
    expect(sent).toHaveLength(2);
    expect(sent[0].attachments).toHaveLength(1);
    const bytes = Uint8Array.from(atob(sent[0].attachments![0].content), ch => ch.charCodeAt(0));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
    expect(sent[1].attachments).toBeUndefined();
  });
  it.each(['on', 'off'])('rejects invalid records before numbering or email with switch %s', async flag => {
    const fetchSpy = externalCalls();
    const logSpies = ['log', 'info', 'warn', 'error', 'debug'].map(method => vi.spyOn(console, method as 'log').mockImplementation(() => {}));
    const now = new Date();
    const minorDob = `${now.getUTCFullYear() - 17}-01-01`;
    for (const [raw, error] of [
      [JSON.stringify({ ...applicantFixture(), notes: 'x'.repeat(17 * 1024) }), 'invalid-applicant'],
      [JSON.stringify({ ...applicantFixture(), dateOfBirth: minorDob }), 'invalid-applicant'],
      ['{bad', 'invalid-mobile'], [JSON.stringify({ firstName: 'Fixture' }), 'invalid-mobile'],
    ]) {
      const res = await submitRecord(raw, flag);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const table of ['application_counters', 'membership_applications', 'application_payloads']) {
      expect(await testEnv.PMES_DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).toEqual({ n: 0 });
    }
    logSpies.forEach(spy => expect(spy).not.toHaveBeenCalled());
  });
  it('rejects conflicting subscription values before external calls or writes', async () => {
    const calls = externalCalls();
    const res = await submitRecord(JSON.stringify(applicantFixture()), 'on', { shares: '1000' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid-applicant' });
    expect(calls).not.toHaveBeenCalled();
  });
  it.each([{ name: 123 }, { email: ['fixture@example.com'] }, { message: {} }, { 'cf-turnstile-response': [] }])(
    'rejects wrongly typed envelope fields before storing the record %#', async extra => {
      const calls = externalCalls();
      const res = await submitRecord(JSON.stringify(applicantFixture()), 'on', extra);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid-body' });
      expect(calls).not.toHaveBeenCalled();
      expect(await testEnv.PMES_DB.prepare('SELECT COUNT(*) AS n FROM membership_applications').first()).toEqual({ n: 0 });
    });
  it('returns a generic storage error without sending email or logging a database error', async () => {
    const calls = externalCalls();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await testEnv.PMES_DB.exec("CREATE TRIGGER reject_payload BEFORE INSERT ON application_payloads BEGIN SELECT RAISE(ABORT, 'fixture-private-database-error'); END;");
    try {
      const res = await submitRecord(JSON.stringify(applicantFixture()), 'on');
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'storage-failed' });
      expect(calls).toHaveBeenCalledTimes(1); // Turnstile only.
      expect(log).not.toHaveBeenCalled();
      for (const table of ['application_counters', 'membership_applications', 'application_payloads']) {
        expect(await testEnv.PMES_DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).toEqual({ n: 0 });
      }
    } finally { await testEnv.PMES_DB.exec('DROP TRIGGER reject_payload'); }
  });
});
