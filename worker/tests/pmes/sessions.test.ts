import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import {
  generateCode,
  manilaDayEnd,
  createSession,
  findOpenSession,
  closeSession,
} from '../../src/pmes/sessions';

const CODE_RE = /^PMES-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;
const input = (sessionDate: string) => ({
  sessionDate,
  venue: 'Main Hall',
  presenterName: 'Presenter One',
  chairName: 'Chair One',
  presenterId: 1,
  timerMinutes: 20,
});

beforeAll(async () => {
  await env.PMES_DB.prepare(
    "INSERT INTO pmes_presenters (id, username, display_name, password_hash, password_salt, created_at) VALUES (1, 'Presenter One', 'Presenter One', 'x', 'y', '2026-10-21T00:00:00.000Z')",
  ).run();
});

describe('generateCode', () => {
  it('matches PMES-XXXX from the restricted alphabet', () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(CODE_RE);
  });

  it('uses the injected random source', () => {
    expect(generateCode(() => 0)).toBe('PMES-AAAA');
    expect(generateCode(n => n - 1)).toBe('PMES-9999');
  });
});

describe('manilaDayEnd', () => {
  it('is 23:59:59 Asia/Manila expressed in UTC', () => {
    expect(manilaDayEnd('2026-11-05')).toBe('2026-11-05T15:59:59.000Z');
  });
});

describe('sessions', () => {
  it('creates a session with a valid code and returns the row', async () => {
    const row = await createSession(env.PMES_DB, input('2026-11-05'));
    expect(row.id).toBeGreaterThan(0);
    expect(row.code).toMatch(CODE_RE);
    expect(row.session_date).toBe('2026-11-05');
    expect(row.status).toBe('open');
    expect(row.presenter_id).toBe(1);
    expect(row.timer_minutes).toBe(20);
  });

  it('two sessions on the same date get different codes', async () => {
    const a = await createSession(env.PMES_DB, input('2026-11-06'));
    const b = await createSession(env.PMES_DB, input('2026-11-06'));
    expect(a.code).not.toBe(b.code);
  });

  it('retries the code on a UNIQUE conflict', async () => {
    let calls = 0;
    // First draw collides with the second (same date); the retry must pick another.
    const first = await createSession(env.PMES_DB, input('2026-11-07'), () => 0);
    expect(first.code).toBe('PMES-AAAA');
    const second = await createSession(env.PMES_DB, input('2026-11-07'), n => (calls++ < 4 ? 0 : n - 1));
    expect(second.code).toBe('PMES-9999');
  });

  it('finds an open session by code within its Manila day (Review Focus 4)', async () => {
    const row = await createSession(env.PMES_DB, input('2026-11-05'));
    const found = await findOpenSession(env.PMES_DB, row.code, '2026-11-05T15:00:00Z');
    expect(found).toMatchObject({ id: row.id, code: row.code });
    expect(await findOpenSession(env.PMES_DB, row.code, '2026-11-05T16:00:01Z')).toBe('code-expired');
  });

  it('is not valid before midnight Manila on the session date', async () => {
    const row = await createSession(env.PMES_DB, input('2026-11-06'));
    // 2026-11-05T15:59:59Z is still 2026-11-05 in Manila: a future session reads as an unknown code.
    expect(await findOpenSession(env.PMES_DB, row.code, '2026-11-05T15:59:59Z')).toBe('invalid-code');
    expect(await findOpenSession(env.PMES_DB, row.code, '2026-11-05T16:00:00Z')).toMatchObject({ id: row.id });
  });

  it('is case-insensitive and trims the code', async () => {
    const row = await createSession(env.PMES_DB, input('2026-11-08'));
    const found = await findOpenSession(env.PMES_DB, `  ${row.code.toLowerCase()} `, '2026-11-08T01:00:00Z');
    expect(found).toMatchObject({ id: row.id });
  });

  it('returns invalid-code for an unknown code', async () => {
    expect(await findOpenSession(env.PMES_DB, 'PMES-ZZZZ', '2026-11-05T01:00:00Z')).toBe('invalid-code');
  });

  it('returns session-closed after closeSession', async () => {
    const row = await createSession(env.PMES_DB, input('2026-11-09'));
    await closeSession(env.PMES_DB, row.id, '2026-11-09T05:00:00.000Z');
    expect(await findOpenSession(env.PMES_DB, row.code, '2026-11-09T06:00:00Z')).toBe('session-closed');
    const { closed_at, status } = (await env.PMES_DB.prepare('SELECT status, closed_at FROM pmes_sessions WHERE id = ?')
      .bind(row.id)
      .first<{ status: string; closed_at: string }>())!;
    expect(status).toBe('closed');
    expect(closed_at).toBe('2026-11-09T05:00:00.000Z');
  });

  it('prefers the session whose Manila day contains now when two dates share a code', async () => {
    const old = await createSession(env.PMES_DB, input('2026-12-01'), () => 5);
    const today = await createSession(env.PMES_DB, input('2026-12-02'), () => 5);
    expect(old.code).toBe(today.code);
    expect(await findOpenSession(env.PMES_DB, old.code, '2026-12-02T01:00:00Z')).toMatchObject({ id: today.id });
    expect(await findOpenSession(env.PMES_DB, old.code, '2026-12-01T01:00:00Z')).toMatchObject({ id: old.id });
    // Neither day contains now: the most recent is reported, as expired.
    expect(await findOpenSession(env.PMES_DB, old.code, '2026-12-03T01:00:00Z')).toBe('code-expired');
  });
});
