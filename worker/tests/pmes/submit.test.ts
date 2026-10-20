import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../../src/index';
import { createSession } from '../../src/pmes/sessions';
import { loadBank } from '../../src/pmes/bank';

const ORIGIN = 'https://isatucmpc.coop';
const BASE = 'https://forms.isatucmpc.coop/api/pmes';
const db = () => env.PMES_DB;
const NO_RETAKES = 'Please see the Education and Training Committee. The presenter can allow another attempt.';

const testEnv = (over: Partial<typeof env> = {}) => ({
  ...env,
  PMES_DRAW_STATUS: 'draft',
  PMES_RL: { limit: async () => ({ success: true }) },
  ...over,
});

let resendStatus = 200;
const fetchStub = vi.fn(async (input: unknown) => {
  if (String(input).includes('api.resend.com')) return new Response(JSON.stringify({ id: 'x' }), { status: resendStatus });
  return new Response(JSON.stringify({ success: true }));
});
vi.stubGlobal('fetch', fetchStub);

const manilaToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const manilaYear = () => new Date(Date.now() + 8 * 3600e3).getUTCFullYear();

function post(path: string, json: unknown, headers: Record<string, string> = { origin: ORIGIN }) {
  return worker.fetch(
    new Request(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(json) }),
    testEnv(),
    {} as any,
  );
}
const get = (path: string) => worker.fetch(new Request(`${BASE}${path}`), testEnv(), {} as any);

async function start(idNumber = 'A-1'): Promise<{ attemptId: string; attemptNo: number }> {
  const res = await post('/start', {
    code: 'PMES-AAAA', idType: 'application', idNumber, fullName: 'Attendee Name', mobile: '09171234567', email: 'attendee@example.com', consent: true, turnstile: 'tok',
  });
  expect(res.status).toBe(200);
  return res.json();
}

/** Correct answers for the stored draw, read back from the DB and the bank. */
async function correctAnswers(attemptId: string) {
  const row = await db().prepare('SELECT draw_json FROM pmes_attempts WHERE id = ?').bind(attemptId).first<{ draw_json: string }>();
  const byId = new Map(loadBank('draft').questions.map(q => [q.id, q]));
  return (JSON.parse(row!.draw_json) as { id: string; optionOrder: number[] }[]).map((item, i) => ({
    n: i + 1,
    choice: item.optionOrder.indexOf(byId.get(item.id)!.answer),
  }));
}
const nullAnswers = () => Array.from({ length: 20 }, (_, i) => ({ n: i + 1, choice: null }));
const attemptRow = (id: string) => db().prepare('SELECT * FROM pmes_attempts WHERE id = ?').bind(id).first<any>();
const certRow = (no: string) => db().prepare('SELECT * FROM pmes_certificates WHERE no = ?').bind(no).first<any>();

describe('POST /api/pmes/submit', () => {
  beforeEach(async () => {
    resendStatus = 200;
    fetchStub.mockClear();
    await db().batch(
      ['pmes_overrides', 'pmes_certificates', 'pmes_counters', 'pmes_attempts', 'pmes_sessions', 'pmes_presenters'].map(t =>
        db().prepare(`DELETE FROM ${t}`),
      ),
    );
    await db()
      .prepare(
        "INSERT INTO pmes_presenters (id, username, display_name, password_hash, password_salt, created_at) VALUES (1, 'presenter', 'Presenter', 'h', 's', '2026-10-21T00:00:00Z')",
      )
      .run();
    await createSession(
      db(),
      { sessionDate: manilaToday(), venue: 'Main Hall', presenterName: 'Presenter', chairName: 'Chair', presenterId: 1, timerMinutes: 20 },
      () => 0, // PMES-AAAA
    );
  });

  it('all correct: 20/20, passed, certificate issued, emails sent', async () => {
    const { attemptId } = await start();
    const res = await post('/submit', { attemptId, answers: await correctAnswers(attemptId) });
    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json).toMatchObject({ score: 20, total: 20, passed: true, reviewSections: [], certificateNo: `PMES-${manilaYear()}-0001`, retakesLeft: 0 });
    expect(json.certificateKey).toMatch(/^[0-9a-f]{32}$/);
    expect(json.message).toBeUndefined();
    const row = await attemptRow(attemptId);
    expect(row).toMatchObject({ score: 20, passed: 1, status: 'submitted' });
    expect(JSON.parse(row.answers_json)).toHaveLength(20);
    expect(row.submitted_at).toBeTruthy();
    expect(await certRow(json.certificateNo)).toMatchObject({ attempt_id: attemptId, key: json.certificateKey, email_status: 'sent' });
    expect(fetchStub.mock.calls.filter(([u]) => String(u).includes('api.resend.com'))).toHaveLength(2);
  });

  it('all null: 0/20, retakesLeft 2, every section to review, no certificate', async () => {
    const { attemptId } = await start();
    const json = await (await post('/submit', { attemptId, answers: nullAnswers() })).json<any>();
    expect(json).toEqual({
      score: 0, total: 20, passed: false, reviewSections: loadBank('draft').sections.map(s => s.id), certificateNo: null, certificateKey: null, retakesLeft: 2,
    });
    expect(await attemptRow(attemptId)).toMatchObject({ score: 0, passed: 0, status: 'submitted' });
  });

  it('second submit → 409 already-submitted', async () => {
    const { attemptId } = await start();
    await post('/submit', { attemptId, answers: nullAnswers() });
    const res = await post('/submit', { attemptId, answers: nullAnswers() });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already-submitted' });
  });

  it('deadline + 100 s still scores (120 s grace)', async () => {
    const { attemptId } = await start();
    await db().prepare('UPDATE pmes_attempts SET deadline_at = ? WHERE id = ?').bind(new Date(Date.now() - 100e3).toISOString(), attemptId).run();
    const res = await post('/submit', { attemptId, answers: await correctAnswers(attemptId) });
    expect(res.status).toBe(200);
    expect((await res.json<any>()).score).toBe(20);
  });

  it('deadline + 130 s → 410 expired, stored as score 0, still counts as an attempt', async () => {
    const { attemptId } = await start();
    await db().prepare('UPDATE pmes_attempts SET deadline_at = ? WHERE id = ?').bind(new Date(Date.now() - 130e3).toISOString(), attemptId).run();
    const res = await post('/submit', { attemptId, answers: await correctAnswers(attemptId) });
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'expired', score: 0, total: 20, passed: false, retakesLeft: 2 });
    expect(await attemptRow(attemptId)).toMatchObject({ score: 0, passed: 0, status: 'expired' });
    expect((await start()).attemptNo).toBe(2);
  });

  it('third failed attempt → retakesLeft 0 with the committee message', async () => {
    await start();
    await start();
    const { attemptId, attemptNo } = await start();
    expect(attemptNo).toBe(3);
    const json = await (await post('/submit', { attemptId, answers: nullAnswers() })).json<any>();
    expect(json).toMatchObject({ passed: false, retakesLeft: 0, message: NO_RETAKES });
  });

  it('Resend 500: response still 200 with the certificate; email_status failed', async () => {
    resendStatus = 500;
    const { attemptId } = await start();
    const res = await post('/submit', { attemptId, answers: await correctAnswers(attemptId) });
    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.certificateNo).toBe(`PMES-${manilaYear()}-0001`);
    expect((await certRow(json.certificateNo)).email_status).toBe('failed');
  });

  it('unknown attempt → 404; bad body → 400', async () => {
    let res = await post('/submit', { attemptId: 'nope', answers: [] });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'unknown-attempt' });
    res = await post('/submit', { attemptId: 'x', answers: 'no' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing-fields' });
  });

  it('403 without an Origin header', async () => {
    expect((await post('/submit', { attemptId: 'x', answers: [] }, {})).status).toBe(403);
  });
});
