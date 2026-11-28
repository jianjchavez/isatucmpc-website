import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { monthlyDeduction } from '../src/membership/deduction';
import { applicantFixture } from './fixtures/application-record';

const tables = ['application_payloads', 'membership_applications', 'application_counters'];
const bindings = {
  ...env, SITE_ORIGIN: 'https://site.example', TURNSTILE_SECRET: 'test-secret',
  RESEND_API_KEY: 'test-key', TO_EMAIL: 'office@example.com', WEBSITE_APP_PULL: 'on',
  PUBLIC_RL: { limit: async () => ({ success: true }) },
};
const outbound = vi.fn<typeof fetch>();
const record = () => ({ ...applicantFixture(), firstName: 'Test', lastName: 'Member A', email: 'member@example.com' });
const body = (patch: Record<string, unknown> = {}) => ({
  name: 'Test Member A', email: 'member@example.com', message: 'Test application',
  'form-source': 'membership', 'cf-turnstile-response': 'test-token',
  shares: '500', years: '3', applicant: JSON.stringify(record()), ...patch,
});
const snapshot = async () => Promise.all(tables.map(async table =>
  (await env.PMES_DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
const submitRaw = (raw: string) => worker.fetch(new Request('https://worker.example/api/submit', {
  method: 'POST', headers: { origin: bindings.SITE_ORIGIN, 'content-type': 'application/json' }, body: raw,
}), bindings, {} as ExecutionContext);
async function rejected(raw: string, error: string) {
  const before = await snapshot();
  const response = await submitRaw(raw);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error });
  expect(outbound).not.toHaveBeenCalled();
  expect(await snapshot()).toEqual(before);
}

beforeEach(async () => {
  await env.PMES_DB.batch(tables.map(table => env.PMES_DB.prepare(`DELETE FROM ${table}`)));
  outbound.mockReset().mockRejectedValue(new Error('Unexpected outbound call'));
  vi.stubGlobal('fetch', outbound);
});
afterEach(() => vi.unstubAllGlobals());

describe('membership HTTP input boundary', () => {
  it.each(['email', 'message'])('requires %s even when every other field is valid', async key => {
    await rejected(JSON.stringify(body({ [key]: undefined })), 'missing-fields');
  });
  it.each(['member@@example.com', 'member@example', 'test member@example.com'])('rejects malformed email %s', async email => {
    await rejected(JSON.stringify(body({ email })), 'invalid-email');
  });
  it.each([7, ['membership']])('does not coerce a non-string form source (%j)', async source => {
    await rejected(JSON.stringify(body({ 'form-source': source })), 'invalid-body');
  });
  it.each(['null', '[]', '123', '{'])('refuses non-object or malformed JSON %s', async raw => {
    await rejected(raw, 'invalid-body');
  });
  it.each(['0917123456', '091712345678', '08171234567'])('refuses incorrect mobile length or prefix: %s', async contactNumber => {
    await rejected(JSON.stringify(body({ applicant: JSON.stringify({ ...record(), contactNumber }) })), 'invalid-mobile');
  });
  it.each([42, ['09171234567']])('refuses non-string nested mobile %j', async contactNumber => {
    await rejected(JSON.stringify(body({ applicant: JSON.stringify({ ...record(), contactNumber }) })), 'invalid-mobile');
  });
  it('enforces the UTF-8 payload limit at the route before siteverify or numbering', async () => {
    // This JSON is under 16K characters but above 16 KiB; the extra field is otherwise ignored.
    const applicant = JSON.stringify({ ...record(), extra: '界'.repeat(5500) });
    expect(applicant.length).toBeLessThan(16384);
    expect(new TextEncoder().encode(applicant).byteLength).toBeGreaterThan(16384);
    await rejected(JSON.stringify(body({ applicant })), 'invalid-applicant');
  });
  it('preserves false consent and blank optional contract fields in the stored payload', async () => {
    // NOTE: MembershipForm.astro requires consent, membership type, address, employment,
    // emergency contact, PMES mode, parent and a beneficiary; the worker permits these blanks.
    const applicant = { ...record(), privacyConsent: false, membershipType: '', presentAddress: '',
      employmentCategory: '', emergencyContact: { name: '', phone: '', relationship: '' },
      pmesMode: '', parent: { name: '', dateOfBirth: '', contact: '' }, beneficiaries: [] };
    outbound.mockImplementation(async input => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return Response.json({ success: true });
      if (url === 'https://api.resend.com/emails') return Response.json({ id: 'test-email' });
      throw new Error('Unexpected outbound URL');
    });
    const response = await submitRaw(JSON.stringify(body({ applicant: JSON.stringify(applicant) })));
    expect(response.status).toBe(200);
    const result = await response.json<{ applicationNo: string }>();
    const stored = await env.PMES_DB.prepare('SELECT payload FROM application_payloads WHERE no = ?').bind(result.applicationNo).first<string>('payload');
    expect(JSON.parse(stored!)).toMatchObject(applicant);
    expect(outbound).toHaveBeenCalledTimes(3);
  });
});

describe('deduction boundaries', () => {
  it('starts welfare at age 18 and never charges capital for the 50 fully paid shares', () => {
    expect(monthlyDeduction(50, 1, 17)).toEqual({ months: 12, capital: 0, welfare: 0, total: 0 });
    expect(monthlyDeduction(50, 1, 18)).toEqual({ months: 12, capital: 0, welfare: 200, total: 200 });
  });
  it('rounds the unpaid share installment and combined deduction to cents', () => {
    // 51 shares less 50 paid = PHP 50 over 36 months = PHP 1.3888..., rounded to PHP 1.39.
    expect(monthlyDeduction(51, 3, 18)).toEqual({ months: 36, capital: 1.39, welfare: 200, total: 201.39 });
    expect(monthlyDeduction(51, 3, 56)).toEqual({ months: 36, capital: 1.39, welfare: 0, total: 1.39 });
  });
});
