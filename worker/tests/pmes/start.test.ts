import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../../src/index';
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
  idType: 'application',
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
      { sessionDate: manilaToday(), venue: 'Main Hall', presenterName: 'Presenter', chairName: 'Chair', presenterId: 1, timerMinutes: 20 },
      () => 0, // PMES-AAAA
    );
    sessionId = row.id;
  });

  const okBody = (over: Record<string, unknown> = {}) => body({ code: 'PMES-AAAA', ...over });

  it('happy path: 20 questions without answers, attemptNo 1, deadline 20 min out', async () => {
    const before = Date.now();
    const res = await start(okBody());
    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.attemptId).toMatch(/^[0-9a-f]{32}$/);
    expect(json.attemptNo).toBe(1);
    expect(json.questions).toHaveLength(20);
    for (const q of json.questions) {
      expect(Object.keys(q).sort()).toEqual(['id', 'n', 'options', 'section', 'text']);
      expect(q.options).toHaveLength(4);
    }
    expect(JSON.stringify(json)).not.toContain('"answer"');
    const deadline = Date.parse(json.deadlineAt);
    expect(deadline - before).toBeGreaterThanOrEqual(20 * 60e3 - 50);
    expect(deadline - before).toBeLessThan(20 * 60e3 + 5000);
    const row = await db().prepare('SELECT * FROM pmes_attempts WHERE id = ?').bind(json.attemptId).first<any>();
    expect(row).toMatchObject({ session_id: sessionId, attempt_no: 1, id_type: 'application', id_number: 'A-1', full_name: 'Attendee Name', email: 'attendee@example.com', status: 'started', deadline_at: json.deadlineAt });
    expect(JSON.parse(row.draw_json)).toHaveLength(20);
    expect(turnstile).toHaveBeenCalledOnce();
  });

  it('no deadline when the session has no timer', async () => {
    await db().prepare('UPDATE pmes_sessions SET timer_minutes = 0').run();
    const json = await (await start(okBody())).json<any>();
    expect(json.deadlineAt).toBeNull();
  });

  it('second start by the same identity is attemptNo 2', async () => {
    await start(okBody());
    const json = await (await start(okBody({ idNumber: ' A-1 ' }))).json<any>();
    expect(json.attemptNo).toBe(2);
  });

  it('already-passed after a passed attempt', async () => {
    const first = await (await start(okBody())).json<any>();
    await db().prepare('UPDATE pmes_attempts SET passed = 1 WHERE id = ?').bind(first.attemptId).run();
    const res = await start(okBody());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already-passed' });
  });

  it('attempts-exhausted after 3 attempts; an override grants 3 more', async () => {
    for (let i = 0; i < 3; i++) expect((await start(okBody())).status).toBe(200);
    let res = await start(okBody());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'attempts-exhausted' });

    await db()
      .prepare("INSERT INTO pmes_overrides (session_id, id_type, id_number, reason, presenter_id, created_at) VALUES (?, 'application', 'A-1', 'r', 1, '2026-10-21T00:00:00Z')")
      .bind(sessionId)
      .run();
    for (const n of [4, 5, 6]) {
      res = await start(okBody());
      expect(res.status).toBe(200);
      expect((await res.json<any>()).attemptNo).toBe(n);
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
    expect(limit).toHaveBeenCalledWith({ key: '203.0.113.9:application:A-1' });
  });

  it('409 attempts-exhausted when a concurrent start takes the next attempt_no between the count and the INSERT', async () => {
    const first = await (await start(okBody())).json<any>();
    // Race: after start has counted 1 attempt, a rival start lands attempt_no 2 just before this INSERT runs.
    const raceRow = () =>
      db()
        .prepare(
          `INSERT INTO pmes_attempts (id, session_id, attempt_no, id_type, id_number, full_name, mobile, email, consent_at, draw_json, started_at, status)
           SELECT 'race', session_id, 2, id_type, id_number, full_name, mobile, email, consent_at, draw_json, started_at, status FROM pmes_attempts WHERE id = ?`,
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
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'attempts-exhausted' });
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
