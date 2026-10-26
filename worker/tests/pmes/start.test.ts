import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../../src/index';
import { issueApplicationNo } from '../../src/membership/applications';
import { createSession } from '../../src/pmes/sessions';

const ORIGIN = 'https://isatucmpc.coop';
const URL = 'https://forms.isatucmpc.coop/api/pmes/start';
const db = () => env.PMES_DB;

/** Test env: draft bank, rate limiter stubbed open. Submit/admin lanes can reuse this shape. */
export const testEnv = (over: Partial<typeof env> = {}) => ({
  ...env,
  PMES_DRAW_STATUS: 'draft',
  PMES_RL: { limit: async () => ({ success: true }) },
  ...over,
});

const turnstile = vi.fn(async (_input?: unknown, _init?: unknown) => new Response(JSON.stringify({ success: true })));
vi.stubGlobal('fetch', turnstile);

const manilaToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

const body = (over: Record<string, unknown> = {}) => ({
  code: 'PMES-AB23',
  idType: 'member',
  idNumber: 'a-1',
  fullName: ' Attendee Name ',
  mobile: '09171234567',
  email: 'Attendee@Example.com',
  consent: true,
  turnstile: 'tok',
  ...over,
});

function start(json: unknown, e = testEnv(), headers: Record<string, string> = { origin: ORIGIN }) {
  return worker.fetch(
    new Request(URL, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(json) }),
    e,
    {} as any,
  );
}

describe('POST /api/pmes/start', () => {
  let sessionId: number;
  beforeEach(async () => {
    turnstile.mockClear();
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
    const row = await createSession(
      db(),
      { sessionDate: manilaToday(), venue: 'Main Hall', presenterName: 'Presenter', chairName: 'Chair', presenterId: 1 },
      () => 0, // PMES-AAAA
    );
    sessionId = row.id;
  });

  const okBody = (over: Record<string, unknown> = {}) => body({ code: 'PMES-AAAA', ...over });

  it('returns only question 1 with secondsLeft 30; member start unchanged', async () => {
    const res = await start(okBody());
    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.attemptId).toMatch(/^[0-9a-f]{32}$/);
    expect(json).toMatchObject({ fullName: 'Attendee Name', total: 20, secondsLeft: 30, question: { n: 1 } });
    expect(json.questions).toBeUndefined();
    expect(json.deadlineAt).toBeUndefined();
    expect(Object.keys(json.question).sort()).toEqual(['id', 'n', 'options', 'section', 'text']);
    expect(json.question.options).toHaveLength(4);
    expect(JSON.stringify(json)).not.toContain('"answer"');
    const row = await db().prepare('SELECT * FROM pmes_attempts WHERE id = ?').bind(json.attemptId).first<any>();
    expect(row).toMatchObject({ session_id: sessionId, attempt_no: 1, id_type: 'member', id_number: 'A-1', full_name: 'Attendee Name', email: 'attendee@example.com', status: 'started', deadline_at: null, current_n: 1 });
    expect(JSON.parse(row.draw_json)).toHaveLength(20);
    expect(JSON.parse(row.answers_json)).toEqual(Array(20).fill(null));
    expect(Number.isFinite(Date.parse(row.served_at))).toBe(true);
    expect(turnstile).toHaveBeenCalledOnce();
  });

  it('application start needs the matching mobile and uses the stored identity', async () => {
    await db().prepare('DELETE FROM membership_applications').run();
    await db().prepare('DELETE FROM application_counters').run();
    const no = await issueApplicationNo(db(), { fullName: 'Application Name', mobile: '09171234567', email: 'stored@example.com' }, '2026-10-26T00:00:00Z');
    expect(no).toBe('APP-2026-0001');
    const appBody = (over = {}) => okBody({ idType: 'application', idNumber: no, fullName: undefined, email: undefined, ...over });
    for (const mobile of ['+63 917 123 4567', '0917 123 4567']) {
      const res = await start(appBody({ mobile }));
      expect(res.status).toBe(200);
      const json = await res.json<any>();
      expect(json.fullName).toBe('Application Name');
      expect(await db().prepare('SELECT full_name, mobile, email FROM pmes_attempts WHERE id = ?').bind(json.attemptId).first()).toEqual({ full_name: 'Application Name', mobile: '09171234567', email: 'stored@example.com' });
    }
    for (const over of [{ mobile: '09999999999' }, { idNumber: 'APP-2026-9999' }, { mobile: '12345' }]) {
      const res = await start(appBody(over));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'unknown-application' });
    }
  });

  it('legacy session timer does not change per-question time', async () => {
    await db().prepare('UPDATE pmes_sessions SET timer_minutes = 0').run();
    const json = await (await start(okBody())).json<any>();
    expect(json.secondsLeft).toBe(30);
  });

  it('second start resumes the same attempt and advances elapsed questions', async () => {
    const first = await (await start(okBody())).json<any>();
    await db().prepare('UPDATE pmes_attempts SET served_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 36_000).toISOString(), first.attemptId).run();
    const res = await start(okBody({ idNumber: ' A-1 ' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ attemptId: first.attemptId, attemptNo: 1, question: { n: 2 } });
    expect(await db().prepare('SELECT COUNT(*) AS n FROM pmes_attempts').first()).toEqual({ n: 1 });
  });

  it('someone else with the same member number cannot take over a live attempt', async () => {
    const first = await (await start(okBody({ idType: 'member', idNumber: 'M-77', fullName: 'Owner', email: 'owner@example.com' }))).json<any>();
    const res = await start(okBody({ idType: 'member', idNumber: 'M-77', fullName: 'Other', email: 'other@example.com' }));
    expect(res.status).toBe(409);
    const json = await res.json<any>();
    expect(json).toEqual({ error: 'attempt-in-progress' });
    expect(JSON.stringify(json)).not.toContain(first.attemptId);
  });

  it('second start finalizes a fully expired live attempt instead of creating another', async () => {
    const first = await (await start(okBody())).json<any>();
    await db().prepare('UPDATE pmes_attempts SET served_at = ? WHERE id = ?')
      .bind(new Date(Date.now() - 606_000).toISOString(), first.attemptId).run();
    const res = await start(okBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ attemptNo: 1, score: 0, passed: false, retakesLeft: 2 });
    expect(await db().prepare('SELECT COUNT(*) AS n FROM pmes_attempts').first()).toEqual({ n: 1 });
  });

  it('second start recovers a stale submitting attempt without creating another', async () => {
    const first = await (await start(okBody())).json<any>();
    await db().prepare(`UPDATE pmes_attempts SET status = 'submitting', current_n = 21,
      score = 0, passed = 0, submitted_at = ? WHERE id = ?`)
      .bind(new Date(Date.now() - 31_000).toISOString(), first.attemptId).run();
    const res = await start(okBody());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ attemptNo: 1, score: 0, passed: false });
    expect(await db().prepare('SELECT COUNT(*) AS n FROM pmes_attempts').first()).toEqual({ n: 1 });
  });

  it('already-passed after a passed attempt', async () => {
    const first = await (await start(okBody())).json<any>();
    await db().prepare("UPDATE pmes_attempts SET passed = 1, status = 'submitted' WHERE id = ?").bind(first.attemptId).run();
    const res = await start(okBody());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already-passed' });
  });

  it('attempts-exhausted after 3 attempts; an override grants 3 more', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await start(okBody())).status).toBe(200);
      await db().prepare("UPDATE pmes_attempts SET status = 'submitted', passed = 0").run();
    }
    let res = await start(okBody());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'attempts-exhausted' });

    await db()
      .prepare("INSERT INTO pmes_overrides (session_id, id_type, id_number, reason, presenter_id, created_at) VALUES (?, 'member', 'A-1', 'r', 1, '2026-10-21T00:00:00Z')")
      .bind(sessionId)
      .run();
    for (const n of [4, 5, 6]) {
      res = await start(okBody());
      expect(res.status).toBe(200);
      expect((await res.json<any>()).attemptNo).toBe(n);
      await db().prepare("UPDATE pmes_attempts SET status = 'submitted', passed = 0").run();
    }
    res = await start(okBody());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'attempts-exhausted' });
  });

  it.each([
    ['missing-fields', body({ fullName: '' }), 400],
    ['missing-fields', body({ idType: 'other' }), 400],
    ['invalid-mobile', body({ mobile: '9171234567' }), 400],
    ['invalid-email', body({ email: 'nope' }), 400],
    ['consent-required', body({ consent: false }), 400],
    ['invalid-code', body({ code: 'PMES-ZZZZ' }), 400],
  ])('%s', async (error, json, status) => {
    const res = await start(json);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it('rate-limited when PMES_RL refuses; the key is IP plus identity', async () => {
    const limit = vi.fn(async (_o: { key: string }) => ({ success: false }));
    const res = await start(okBody(), testEnv({ PMES_RL: { limit } }), { origin: ORIGIN, 'cf-connecting-ip': '203.0.113.9' });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate-limited' });
    expect(limit).toHaveBeenCalledWith({ key: '203.0.113.9:member:A-1' });
  });

  it('rate-limited when the per-IP bucket refuses', async () => {
    const res = await start(okBody(), testEnv({ PMES_RL_IP: { limit: async () => ({ success: false }) } }), { origin: ORIGIN, 'cf-connecting-ip': '203.0.113.9' });
    expect(res.status).toBe(429);
  });

  it('resumes the winner when a concurrent start takes the next attempt_no between the count and the INSERT', async () => {
    const first = await (await start(okBody())).json<any>();
    await db().prepare("UPDATE pmes_attempts SET status = 'submitted', passed = 0 WHERE id = ?").bind(first.attemptId).run();
    // Race: after start has counted 1 attempt, a rival start lands attempt_no 2 just before this INSERT runs.
    const raceRow = () =>
      db()
        .prepare(
          `INSERT INTO pmes_attempts (id, session_id, attempt_no, id_type, id_number, full_name, mobile, email, consent_at, draw_json, started_at, status)
           SELECT 'race', session_id, 2, id_type, id_number, full_name, mobile, email, consent_at, draw_json, started_at, 'started' FROM pmes_attempts WHERE id = ?`,
        )
        .bind(first.attemptId)
        .run();
    const racedDb = new Proxy(db(), {
      get: (target, prop) =>
        prop !== 'prepare'
          ? Reflect.get(target, prop)
          : (sql: string) => {
              const stmt = target.prepare(sql);
              if (!/INSERT INTO pmes_attempts/.test(sql)) return stmt;
              const bind = stmt.bind.bind(stmt);
              stmt.bind = (...args: unknown[]) => {
                const bound = bind(...args);
                const run = bound.run.bind(bound);
                bound.run = async () => { await raceRow(); return run(); };
                return bound;
              };
              return stmt;
            },
    });
    const res = await start(okBody(), testEnv({ PMES_DB: racedDb }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ attemptId: 'race', attemptNo: 2, question: { n: 1 } });
    expect((await db().prepare('SELECT COUNT(*) AS n FROM pmes_attempts').first<any>()).n).toBe(2);
  });

  it('turnstile-failed when siteverify says no', async () => {
    turnstile.mockResolvedValueOnce(new Response(JSON.stringify({ success: false })));
    const res = await start(okBody());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'turnstile-failed' });
  });

  it('session-closed and code-expired use 409 and 410', async () => {
    await db().prepare("UPDATE pmes_sessions SET status = 'closed'").run();
    expect((await start(okBody())).status).toBe(409);
    await db().prepare("UPDATE pmes_sessions SET status = 'open', session_date = '2020-01-01'").run();
    expect((await start(okBody())).status).toBe(410);
  });

  it('403 without an Origin header', async () => {
    const res = await start(okBody(), testEnv(), {});
    expect(res.status).toBe(403);
  });

  it('CORS preflight from the allowed origin carries ACAO, allows Authorization, no credentials', async () => {
    const res = await worker.fetch(
      new Request(URL, {
        method: 'OPTIONS',
        headers: { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,authorization' },
      }),
      testEnv(),
      {} as any,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });
});
