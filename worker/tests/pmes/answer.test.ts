import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    code: 'PMES-AAAA', idType: 'member', idNumber, fullName: 'Attendee Name', mobile: '09171234567', email: 'attendee@example.com', consent: true, turnstile: 'tok',
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

afterEach(() => vi.useRealTimers());

async function finish(attemptId: string, answers: { n: number; choice: number | null }[]) {
  let response!: Response;
  for (const answer of answers) {
    response = await post('/answer', { attemptId, ...answer });
    expect(response.status).toBe(200);
  }
  return response;
}

describe('POST /api/pmes/answer', () => {
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
      { sessionDate: manilaToday(), venue: 'Main Hall', presenterName: 'Presenter', chairName: 'Chair', presenterId: 1 },
      () => 0, // PMES-AAAA
    );
  });

  it('20 answers in order finish with score, missed items and certificate on pass', async () => {
    const { attemptId } = await start();
    const res = await finish(attemptId, await correctAnswers(attemptId));
    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json).toMatchObject({ score: 20, total: 20, passed: true, reviewSections: [], missed: [], certificateNo: `PMES-${manilaYear()}-0001`, retakesLeft: 0 });
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
    const json = await (await finish(attemptId, nullAnswers())).json<any>();
    expect(json).toMatchObject({
      score: 0, total: 20, passed: false, reviewSections: loadBank('draft').sections.map(s => s.id), certificateNo: null, certificateKey: null, retakesLeft: 2,
    });
    expect(json.missed).toHaveLength(20);
    expect(json.missed.every((item: any) => item.yourAnswer === null)).toBe(true);
    expect(await attemptRow(attemptId)).toMatchObject({ score: 0, passed: 0, status: 'submitted' });
    expect(await (await post('/resume', { attemptId })).json()).toEqual(json);
  });

  it('resume of a finished attempt returns the final result without resending emails', async () => {
    const { attemptId } = await start();
    const final = await (await finish(attemptId, await correctAnswers(attemptId))).json();
    const calls = fetchStub.mock.calls.length;
    expect(await (await post('/resume', { attemptId })).json()).toEqual(final);
    expect(await (await post('/answer', { attemptId, n: 20, choice: 0 })).json()).toEqual({ ...final as any, stale: true });
    expect(fetchStub.mock.calls).toHaveLength(calls);
  });

  it('answer at 33 seconds still counts within grace', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { attemptId } = await start();
    const answers = await correctAnswers(attemptId);
    vi.setSystemTime(Date.now() + 33_000);
    const json = await (await post('/answer', { attemptId, ...answers[0] })).json<any>();
    expect(json).toMatchObject({ question: { n: 2 }, secondsLeft: 30 });
    expect(JSON.parse((await attemptRow(attemptId)).answers_json)[0]).toBe(answers[0].choice);
  });

  it('answer after 36 s is recorded as null and the next question is served', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { attemptId } = await start();
    vi.setSystemTime(Date.now() + 36_000);
    const json = await (await post('/answer', { attemptId, n: 1, choice: 0 })).json<any>();
    expect(json).toMatchObject({ question: { n: 2 }, secondsLeft: 24, stale: true });
    const row = await attemptRow(attemptId);
    expect(row.current_n).toBe(2);
    expect(JSON.parse(row.answers_json)).toEqual(Array(20).fill(null));
    expect((await start()).attemptNo).toBe(2);
  });

  it.each([[180_000, 6, 0], [186_000, 7, 24]])('resume after %i ms shows question %i with %i seconds left', async (elapsed, n, secondsLeft) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { attemptId } = await start();
    vi.setSystemTime(Date.now() + elapsed);
    const json = await (await post('/resume', { attemptId })).json<any>();
    expect(json).toMatchObject({ question: { n }, secondsLeft });
    expect((await attemptRow(attemptId)).current_n).toBe(n);
    expect(await (await post('/resume', { attemptId })).json()).toEqual(json);
  });

  it('idle expiry past the last question finalizes once and retains retakes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { attemptId } = await start();
    vi.setSystemTime(Date.now() + 20 * 30_000 + 5001);
    const responses = await Promise.all([post('/resume', { attemptId }), post('/resume', { attemptId })]);
    const finals = await Promise.all(responses.map(r => r.json<any>()));
    expect(finals[0]).toMatchObject({ score: 0, passed: false, retakesLeft: 2 });
    expect(finals[0].missed).toHaveLength(20);
    expect(finals[1]).toMatchObject(finals[0]);
    expect(fetchStub.mock.calls.filter(([u]) => String(u).includes('api.resend.com'))).toHaveLength(2);
  });

  it('duplicate answer for the same n records once and returns stale', async () => {
    const { attemptId } = await start();
    const responses = await Promise.all([0, 1].map(choice => post('/answer', { attemptId, n: 1, choice })));
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const json = await Promise.all(responses.map(r => r.json<any>()));
    expect(json.filter(r => r.stale)).toHaveLength(1);
    expect(json.every(r => r.question.n === 2)).toBe(true);
    const row = await attemptRow(attemptId);
    expect(row.current_n).toBe(2);
    const answers = JSON.parse(row.answers_json);
    expect([0, 1]).toContain(answers[0]);
    expect(answers.slice(1)).toEqual(Array(19).fill(null));
    const retry = await (await post('/answer', { attemptId, n: 1, choice: 3 })).json<any>();
    expect(retry).toMatchObject({ stale: true, question: { n: 2 } });
    expect((await attemptRow(attemptId)).answers_json).toBe(row.answers_json);
  });

  it('concurrent last answers finalize exactly once', async () => {
    const { attemptId } = await start();
    const answers = await correctAnswers(attemptId);
    for (const a of answers.slice(0, 19)) await post('/answer', { attemptId, ...a });
    const responses = await Promise.all([post('/answer', { attemptId, ...answers[19] }), post('/answer', { attemptId, ...answers[19] }), post('/resume', { attemptId })]);
    expect(responses.map(r => r.status)).toEqual([200, 200, 200]);
    const finals = await Promise.all(responses.slice(0, 2).map(r => r.json<any>()));
    for (const final of finals) expect(final).toMatchObject({ score: 20, passed: true, certificateNo: `PMES-${manilaYear()}-0001` });
    expect((await db().prepare('SELECT COUNT(*) AS n FROM pmes_certificates').first<any>()).n).toBe(1);
    expect(fetchStub.mock.calls.filter(([u]) => String(u).includes('api.resend.com'))).toHaveLength(2);
  });

  it.each([-1, 4, 0.5, '1', {}, null])('invalid choice %j is recorded as null', async choice => {
    const { attemptId } = await start();
    expect((await post('/answer', { attemptId, n: 1, choice })).status).toBe(200);
    expect(JSON.parse((await attemptRow(attemptId)).answers_json)[0]).toBeNull();
    expect((await attemptRow(attemptId)).current_n).toBe(2);
  });

  it('future question cannot skip ahead', async () => {
    const { attemptId } = await start();
    expect(await (await post('/answer', { attemptId, n: 5, choice: 0 })).json()).toMatchObject({ stale: true, question: { n: 1 } });
    expect((await attemptRow(attemptId)).current_n).toBe(1);
  });

  it('missed item shows yourAnswer, correctAnswer and slide', async () => {
    const { attemptId } = await start();
    const answers = await correctAnswers(attemptId);
    const draw = JSON.parse((await attemptRow(attemptId)).draw_json);
    const q = loadBank('draft').questions.find(q => q.id === draw[0].id)!;
    answers[0].choice = (answers[0].choice + 1) % 4;
    const json = await (await finish(attemptId, answers)).json<any>();
    expect(json.missed).toEqual([{ n: 1, text: q.text, yourAnswer: q.options[draw[0].optionOrder[answers[0].choice]], correctAnswer: q.options[q.answer], slide: q.slide }]);
  });

  it('/api/pmes/submit is gone (404)', async () => {
    const { attemptId } = await start();
    expect((await post('/submit', { attemptId, answers: await correctAnswers(attemptId) })).status).toBe(404);
    expect((await attemptRow(attemptId)).status).toBe('started');
  });

  it('third failed attempt → retakesLeft 0 with the committee message', async () => {
    await start();
    await start();
    const { attemptId, attemptNo } = await start();
    expect(attemptNo).toBe(3);
    const json = await (await finish(attemptId, nullAnswers())).json<any>();
    expect(json).toMatchObject({ passed: false, retakesLeft: 0, message: NO_RETAKES });
  });

  it('Resend 500: response still 200 with the certificate; email_status failed', async () => {
    resendStatus = 500;
    const { attemptId } = await start();
    const res = await finish(attemptId, await correctAnswers(attemptId));
    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.certificateNo).toBe(`PMES-${manilaYear()}-0001`);
    expect((await certRow(json.certificateNo)).email_status).toBe('failed');
  });

  it('unknown attempt → 404; bad body → 400', async () => {
    let res = await post('/answer', { attemptId: 'nope', n: 1, choice: 0 });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'unknown-attempt' });
    const resume = await post('/resume', { attemptId: 'nope' });
    expect(resume.status).toBe(404);
    expect(await resume.json()).toEqual({ error: 'unknown-attempt' });
    expect((await post('/resume', null)).status).toBe(400);
    res = await post('/answer', { n: 1, choice: 0 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing-fields' });
  });

  it('403 without an Origin header', async () => {
    expect((await post('/answer', { attemptId: 'x', n: 1, choice: 0 }, {})).status).toBe(403);
  });
});

describe('GET /api/pmes/certificate and /verify', () => {
  let no: string;
  let key: string;
  beforeEach(async () => {
    resendStatus = 200;
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
      { sessionDate: manilaToday(), venue: 'Main Hall', presenterName: 'Presenter', chairName: 'Chair', presenterId: 1 },
      () => 0,
    );
    const { attemptId } = await start();
    const json = await (await finish(attemptId, await correctAnswers(attemptId))).json<any>();
    no = json.certificateNo;
    key = json.certificateKey;
  });

  it('certificate with the right key (no Origin needed); wrong key → 404; missing params → 400', async () => {
    const res = await get(`/certificate?no=${no}&key=${key}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ no, fullName: 'Attendee Name', chairName: 'Chair', score: 20, total: 20, verifyUrl: `https://isatucmpc.coop/pmes/verify/?no=${no}` });
    const wrong = await get(`/certificate?no=${no}&key=${'0'.repeat(32)}`);
    expect(wrong.status).toBe(404);
    expect(await wrong.json()).toEqual({ error: 'not-found' });
    expect((await get(`/certificate?no=${no}`)).status).toBe(400);
  });

  it('verify: passed one → 200; unknown number → 404', async () => {
    const res = await get(`/verify?no=${no}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ no, fullName: 'Attendee Name', passed: true, presenterName: 'Presenter' });
    const missing = await get('/verify?no=PMES-2026-9999');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not-found' });
    expect((await get('/verify')).status).toBe(400);
  });
});

describe('public lookups', () => {
  it('rate limits certificate and verify lookups per IP', async () => {
    const env429 = testEnv({ PMES_RL: { limit: async () => ({ success: false }) } });
    for (const path of ['/api/pmes/verify?no=PMES-2026-0001', '/api/pmes/certificate?no=PMES-2026-0001&key=x']) {
      const res = await worker.fetch(new Request(`https://forms.isatucmpc.coop${path}`), env429, {} as any);
      expect(res.status).toBe(429);
    }
  });
});
