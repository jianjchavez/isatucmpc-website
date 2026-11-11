import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker, { type Env } from '../src/index';
import { getApplicationPayload, issueApplicationNo } from '../src/membership/applications';
import { applicantFixture } from './fixtures/application-record';

const NOW = '2026-11-11T18:00:00.000Z';
const SECRET = 'fixture-memberfolio-secret-32-bytes';
const db = env.PMES_DB;
const ago = (days: number) => new Date(Date.parse(NOW) - days * 86400000).toISOString();
let limit: ReturnType<typeof vi.fn<Env['MF_PULL_RL']['limit']>>;
let logs: ReturnType<typeof vi.spyOn>[];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  limit = vi.fn().mockResolvedValue({ success: true });
  logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map(method => vi.spyOn(console, method).mockImplementation(() => {}));
  await db.batch([
    db.prepare('DELETE FROM application_payloads'),
    db.prepare('DELETE FROM membership_applications'),
    db.prepare('DELETE FROM application_counters'),
  ]);
});

afterEach(() => {
  // Error objects are serialized explicitly so a logged exception cannot hide PII.
  const output = JSON.stringify(logs.flatMap(spy => spy.mock.calls), (_, value) => value instanceof Error ? value.message : value);
  for (const value of ['Fixture', '09171234567', 'fixture@example.com', SECRET]) expect(output).not.toContain(value);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const bindings = (overrides: Partial<Env> = {}): Env => ({
  ...env, WEBSITE_APP_PULL: 'on', WEBSITE_APP_PULL_SECRET: SECRET,
  MF_PULL_RL: { limit }, ...overrides,
});

async function seed(days = 0, stored = true) {
  return issueApplicationNo(db, { fullName: 'Fixture Applicant', mobile: '09171234567', email: 'fixture@example.com' },
    ago(days), stored ? applicantFixture() : undefined);
}

async function request(no: string, method = 'GET', overrides: Partial<Env> = {}, authorization: string | null = `Bearer ${SECRET}`) {
  const headers = new Headers({ Origin: 'https://isatucmpc.coop' });
  if (authorization !== null) headers.set('Authorization', authorization);
  const response = await worker.fetch(new Request(`https://forms.example/api/mf/applications/${no}${method === 'POST' ? '/ack' : ''}`, { method, headers }), bindings(overrides), {} as ExecutionContext);
  expect([...response.headers.keys()].filter(key => key.startsWith('access-control-'))).toEqual([]);
  if (response.status !== 200) {
    const body = await response.clone().text();
    for (const value of ['Fixture', '09171234567', 'fixture@example.com', SECRET]) expect(body).not.toContain(value);
  }
  return response;
}

async function expectError(response: Response, status: number, error: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error });
}

describe.each(['GET', 'POST'])('%s MemberFolio application route', method => {
  it.each([null, 'Bearer wrong', 'Bearer x'.repeat(50), SECRET, `Basic ${SECRET}`])('rejects missing or invalid bearer authentication (%s)', async authorization => {
    const no = await seed();
    await expectError(await request(no, method, {}, authorization), 401, 'unauthorized');
    expect(await getApplicationPayload(db, no)).not.toBeNull();
  });

  it.each([undefined, '', '   '])('fails closed when the secret is not configured (%s)', async secret => {
    await expectError(await request(await seed(), method, { WEBSITE_APP_PULL_SECRET: secret }), 503, 'not-configured');
  });

  it('returns not-found when disabled and leaves the payload untouched', async () => {
    const no = await seed();
    await expectError(await request(no, method, { WEBSITE_APP_PULL: 'off' }), 404, 'not-found');
    expect(await getApplicationPayload(db, no)).not.toBeNull();
  });

  it('returns not-found for an unknown number or a never-stored application of any age', async () => {
    for (const no of ['APP-2026-9999', await seed(0, false), await seed(91, false)]) {
      await expectError(await request(no, method), 404, 'not-found');
    }
  });

  it.each(['APP-2026-12', "x' OR 1=1", 'APP-2026-0001x'])('rejects malformed application number %s before any database call', async no => {
    const prepare = vi.spyOn(db, 'prepare');
    await expectError(await request(encodeURIComponent(no), method), 404, 'not-found');
    expect(prepare).not.toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith({ key: 'mf-pull' });
  });

  it('rate limits with a constant server key before touching payloads', async () => {
    const no = await seed();
    limit.mockResolvedValue({ success: false });
    await expectError(await request(no, method), 429, 'rate-limited');
    expect(limit).toHaveBeenCalledWith({ key: 'mf-pull' });
    expect(await getApplicationPayload(db, no)).not.toBeNull();
  });

  it('purges expired payloads opportunistically and returns expired', async () => {
    const no = await seed(91);
    const fresh = await seed(89);
    await expectError(await request(no, method), 410, 'expired');
    expect(await getApplicationPayload(db, no)).toBeNull();
    expect(await getApplicationPayload(db, fresh)).not.toBeNull();
    expect(await db.prepare('SELECT pulled_at FROM membership_applications WHERE no = ?').bind(no).first()).toEqual({ pulled_at: null });
  });

  it('redacts database exceptions from the response and console', async () => {
    const brokenDb = { prepare() { throw new Error('Fixture Applicant fixture@example.com 09171234567'); } } as unknown as D1Database;
    await expectError(await request('APP-2026-0001', method, { PMES_DB: brokenDb }), 503, 'storage-failed');
  });
});

it('returns the complete record only to the authenticated caller and prevents caching', async () => {
  const no = await seed();
  const response = await request(no);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ record: { ...applicantFixture(), version: 1, applicationNo: no, submittedAt: NOW } });
  expect(await getApplicationPayload(db, no)).not.toBeNull();
});

it('acknowledges once, deletes only the payload, and reports already-pulled on repeat or GET', async () => {
  const no = await seed();
  const response = await request(no, 'POST');
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
  expect(await getApplicationPayload(db, no)).toBeNull();
  expect(await db.prepare('SELECT pulled_at, full_name, mobile, email FROM membership_applications WHERE no = ?').bind(no).first())
    .toEqual({ pulled_at: NOW, full_name: 'Fixture Applicant', mobile: '09171234567', email: 'fixture@example.com' });
  vi.setSystemTime(new Date(ago(-100)));
  await expectError(await request(no, 'POST'), 410, 'already-pulled');
  await expectError(await request(no), 410, 'already-pulled');
  expect(await db.prepare('SELECT pulled_at FROM membership_applications WHERE no = ?').bind(no).first()).toEqual({ pulled_at: NOW });
});

it('handles concurrent acknowledgments as one success and one already-pulled', async () => {
  const no = await seed();
  const responses = await Promise.all([request(no, 'POST'), request(no, 'POST')]);
  expect(responses.map(response => response.status).sort()).toEqual([204, 410]);
  await expectError(responses.find(response => response.status === 410)!, 410, 'already-pulled');
});

it.each(['', '/ack'])('does not offer CORS preflight for %s', async suffix => {
  const response = await worker.fetch(new Request(`https://forms.example/api/mf/applications/APP-2026-0001${suffix}`, {
    method: 'OPTIONS', headers: { Origin: 'https://isatucmpc.coop', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization' },
  }), bindings(), {} as ExecutionContext);
  expect([404, 405]).toContain(response.status);
  expect([...response.headers.keys()].filter(key => key.startsWith('access-control-'))).toEqual([]);
});

it('purges at the 90-day boundary, preserves younger records and summaries, and counts deletions', async () => {
  const { purgeExpiredPayloads } = await import('../src/membership/retention');
  const expired = await seed(91);
  const boundary = await seed(90);
  const fresh = await seed(89);
  const neverStored = await seed(91, false);
  expect(await purgeExpiredPayloads(db, NOW)).toBe(2);
  expect(await purgeExpiredPayloads(db, NOW)).toBe(0);
  expect(await getApplicationPayload(db, expired)).toBeNull();
  expect(await getApplicationPayload(db, boundary)).toBeNull();
  expect(await getApplicationPayload(db, fresh)).not.toBeNull();
  expect(await db.prepare('SELECT COUNT(*) AS count FROM membership_applications').first()).toEqual({ count: 4 });
  await expectError(await request(expired), 410, 'expired');
  await expectError(await request(neverStored), 404, 'not-found');
});

it('supports an explicit retention period', async () => {
  const { purgeExpiredPayloads } = await import('../src/membership/retention');
  await seed(31);
  const fresh = await seed(29);
  expect(await purgeExpiredPayloads(db, NOW, 30)).toBe(1);
  expect(await getApplicationPayload(db, fresh)).not.toBeNull();
});

it('runs retention through the exported scheduled handler even with the pull switch off', async () => {
  const expired = await seed(91);
  const fresh = await seed(89);
  const controller = { scheduledTime: Date.parse(NOW), cron: '0 18 * * *', noRetry() {} } as ScheduledController;
  await worker.scheduled(controller, bindings({ WEBSITE_APP_PULL: 'off' }), {} as ExecutionContext);
  expect(await getApplicationPayload(db, expired)).toBeNull();
  expect(await getApplicationPayload(db, fresh)).not.toBeNull();
});

it('redacts scheduled database failures without hiding a failed run', async () => {
  const brokenDb = { prepare() { throw new Error('Fixture Applicant fixture@example.com'); } } as unknown as D1Database;
  const controller = { scheduledTime: Date.parse(NOW), cron: '0 18 * * *', noRetry() {} } as ScheduledController;
  await expect(worker.scheduled(controller, bindings({ PMES_DB: brokenDb }), {} as ExecutionContext)).rejects.toThrow(/^retention-failed$/);
});
