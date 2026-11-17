// Face-to-face PMES: attendance, no quiz (Board and Committee 2026-11-17).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../../src/index';
import { hashPassword } from '../../src/pmes/auth';
import { createSession } from '../../src/pmes/sessions';
import { issueApplicationNo } from '../../src/membership/applications';
import { applicantFixture } from '../fixtures/application-record';

const ORIGIN = 'https://isatucmpc.coop';
const API = 'https://forms.isatucmpc.coop/api/pmes';
const db = () => env.PMES_DB;
const testEnv = {
  ...env,
  PMES_DRAW_STATUS: 'approved',
  PMES_RL: { limit: async () => ({ success: true }) },
  PMES_RL_IP: { limit: async () => ({ success: true }) },
  PUBLIC_RL: { limit: async () => ({ success: true }) },
  PMES_SESSION_SECRET: 'test-secret',
  WEBSITE_APP_PULL: 'on',
};
const fetchMock = vi.fn(async (_input?: unknown, _init?: unknown) => new Response(JSON.stringify({ success: true })));
vi.stubGlobal('fetch', fetchMock);

function call(path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  return worker.fetch(
    new Request(API + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv, {} as any,
  );
}
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const daySession = (mode: 'quiz' | 'attendance') =>
  createSession(db(), { sessionDate: today(), venue: 'Main Hall', presenterName: 'Presenter Name', chairName: 'Chair Name', presenterId: 1, mode });
const application = (mobile = '09171234567') =>
  issueApplicationNo(db(), { fullName: 'Walk Attendee', mobile, email: 'walk@example.com' }, new Date().toISOString());
const start = (code: string, idNumber: string, mobile = '09171234567') =>
  call('/start', { code, idType: 'application', idNumber, mobile, consent: true, turnstile: 'tok' });

beforeEach(async () => {
  fetchMock.mockClear();
  await db().batch(['pmes_overrides', 'pmes_certificates', 'pmes_counters', 'pmes_attempts', 'pmes_sessions', 'pmes_presenters', 'application_payloads', 'membership_applications', 'application_counters']
    .map(t => db().prepare(`DELETE FROM ${t}`)));
  const { hash, salt } = await hashPassword('pw-1234');
  await db().prepare("INSERT INTO pmes_presenters (id, username, display_name, password_hash, password_salt, created_at) VALUES (1, 'Presenter Name', 'Presenter Name', ?, ?, '2026-10-21T00:00:00Z')")
    .bind(hash, salt).run();
});
const token = async () => (await (await call('/admin/login', { username: 'Presenter Name', password: 'pw-1234' })).json<{ token: string }>()).token;

describe('face-to-face attendance', () => {
  it('a presenter-created day session is attendance mode', async () => {
    const res = await call('/admin/sessions', { sessionDate: today(), venue: 'Main Hall', presenterName: 'P', chairName: 'C' }, await token());
    expect(await res.json()).toMatchObject({ mode: 'attendance' });
  });

  it('the code checks the applicant in with no quiz; a repeat is harmless', async () => {
    const s = await daySession('attendance');
    const no = await application();
    const res = await start(s.code, no);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checkedIn: true, fullName: 'Walk Attendee', confirmed: false });
    expect((await (await start(s.code, no)).json<{ checkedIn: boolean }>()).checkedIn).toBe(true);
    const rows = await db().prepare('SELECT status, draw_json, score FROM pmes_attempts').all();
    expect(rows.results).toEqual([{ status: 'attended', draw_json: '[]', score: null }]);
  });

  it('a wrong mobile is refused, as for the quiz', async () => {
    const s = await daySession('attendance');
    const no = await application();
    expect((await start(s.code, no, '09179999999')).status).toBe(400);
  });

  it('confirming issues the next certificate numbers, with no score, and emails them', async () => {
    const s = await daySession('attendance');
    const a = await application('09171234567');
    const b = await application('09171234568');
    await start(s.code, a, '09171234567');
    await start(s.code, b, '09171234568');
    const t = await token();
    const roster = await (await call(`/admin/sessions/${s.id}/roster`, undefined, t)).json<{ rows: { attempts: { attemptId: string }[] }[] }>();
    const ids = roster.rows.map(r => r.attempts[0].attemptId);
    fetchMock.mockClear();
    const res = await call(`/admin/sessions/${s.id}/confirm`, { attemptIds: ids }, t);
    const { issued } = await res.json<{ issued: { certificateNo: string; emailStatus: string }[] }>();
    const year = today().slice(0, 4);
    expect(issued.map(i => i.certificateNo).sort()).toEqual([`PMES-${year}-0001`, `PMES-${year}-0002`]);
    expect(issued.every(i => i.emailStatus === 'sent')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4); // attendee + coop, twice
    // Confirming again issues nothing new.
    expect((await (await call(`/admin/sessions/${s.id}/confirm`, { attemptIds: ids }, t)).json<{ issued: unknown[] }>()).issued).toEqual([]);
    const certs = await (await call(`/admin/sessions/${s.id}/certificates`, undefined, t)).json<{ certificates: { no: string; score: number | null; online: boolean }[] }>();
    expect(certs.certificates.map(c => [c.no, c.score, c.online])).toEqual([[`PMES-${year}-0001`, null, false], [`PMES-${year}-0002`, null, false]]);
  });

  it('a walk-in typed in by staff gets the next APP number, its record, and a check-in', async () => {
    const s = await daySession('attendance');
    await application(); // APP-YYYY-0001 already taken online
    const res = await call(`/admin/sessions/${s.id}/walk-in`, { applicant: JSON.stringify(applicantFixture()) }, await token());
    const body = await res.json<{ applicationNo: string; fullName: string }>();
    expect(body).toEqual({ applicationNo: `APP-${today().slice(0, 4)}-0002`, fullName: 'Fixture Applicant' });
    expect(await db().prepare('SELECT COUNT(*) AS n FROM application_payloads WHERE no = ?').bind(body.applicationNo).first('n')).toBe(1);
    expect(await db().prepare("SELECT status FROM pmes_attempts WHERE id_number = ?").bind(body.applicationNo).first('status')).toBe('attended');
    expect((await call(`/admin/sessions/${s.id}/walk-in`, { applicant: '{}' }, await token())).status).toBe(400);
  });

  it('walk-in and confirm are refused on a quiz session; a quiz session still starts the quiz', async () => {
    const s = await daySession('quiz');
    const t = await token();
    expect((await call(`/admin/sessions/${s.id}/walk-in`, { applicant: JSON.stringify(applicantFixture()) }, t)).status).toBe(409);
    expect((await call(`/admin/sessions/${s.id}/confirm`, { attemptIds: ['x'] }, t)).status).toBe(409);
    const no = await application();
    expect(await (await start(s.code, no)).json()).toMatchObject({ total: 20, secondsLeft: 30 });
  });

  it('the roster labels check-ins and confirmed attendance', async () => {
    const s = await daySession('attendance');
    const no = await application();
    await start(s.code, no);
    const t = await token();
    const before = await (await call(`/admin/sessions/${s.id}/roster`, undefined, t)).json<{ rows: { attempts: { attemptId: string }[]; passed: boolean }[]; totals: unknown }>();
    expect(before.totals).toEqual({ attended: 1, passed: 0, failed: 0 });
    await call(`/admin/sessions/${s.id}/confirm`, { attemptIds: [before.rows[0].attempts[0].attemptId] }, t);
    const after = await (await call(`/admin/sessions/${s.id}/roster`, undefined, t)).json<{ totals: unknown }>();
    expect(after.totals).toEqual({ attended: 1, passed: 1, failed: 0 });
  });
});
