import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import {
  hashPassword,
  verifyPassword,
  signSession,
  verifySessionCookie,
  findPresenterByName,
  requirePresenter,
  type PresenterApp,
} from '../../src/pmes/auth';

const SECRET = 'test-secret';
const future = Date.parse('2026-12-31T00:00:00Z');
const past = Date.parse('2026-01-01T00:00:00Z');

beforeAll(async () => {
  const { hash, salt } = await hashPassword('correct horse');
  await env.PMES_DB.prepare(
    "INSERT INTO pmes_presenters (id, username, display_name, password_hash, password_salt, active, created_at) VALUES (1, 'Juan Dela Cruz', 'Juan Dela Cruz', ?, ?, 1, '2026-10-21T00:00:00.000Z'), (2, 'Retired Presenter', 'Retired Presenter', ?, ?, 0, '2026-10-21T00:00:00.000Z')",
  )
    .bind(hash, salt, hash, salt)
    .run();
});

describe('passwords', () => {
  it('round-trips hash/verify and rejects a wrong password', async () => {
    const { hash, salt } = await hashPassword('correct horse');
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyPassword('correct horse', hash, salt)).toBe(true);
    expect(await verifyPassword('wrong horse', hash, salt)).toBe(false);
  });

  it('matches PBKDF2-SHA256/100000 as computed by Node for a fixed salt', async () => {
    const { hash } = await hashPassword('correct horse', '00112233445566778899aabbccddeeff');
    expect(hash).toBe('349385d8369097aac69c91b9cf79c08cc236bd0eea62faca19643b117ca1f56e');
  });

  it('returns false, never throws, on a malformed salt', async () => {
    expect(await verifyPassword('x', 'abcd', 'not-hex')).toBe(false);
    expect(await verifyPassword('x', 'abcd', '')).toBe(false);
  });
});

describe('session cookie', () => {
  it('verifies before expiry and returns null after', async () => {
    const value = await signSession(1, future, SECRET);
    expect(value).toMatch(/^1\.\d+\.[0-9a-f]{64}$/);
    expect(await verifySessionCookie(value, SECRET, '2026-10-21T00:00:00Z')).toEqual({ presenterId: 1 });
    expect(await verifySessionCookie(value, SECRET, '2027-01-01T00:00:00Z')).toBeNull();
    expect(await verifySessionCookie(await signSession(1, past, SECRET), SECRET, '2026-10-21T00:00:00Z')).toBeNull();
  });

  it('returns null for tampered, wrong-secret or malformed values', async () => {
    const value = await signSession(1, future, SECRET);
    const [id, exp, sig] = value.split('.');
    expect(await verifySessionCookie(`2.${exp}.${sig}`, SECRET, '2026-10-21T00:00:00Z')).toBeNull();
    expect(await verifySessionCookie(`${id}.${future + 1000}.${sig}`, SECRET, '2026-10-21T00:00:00Z')).toBeNull();
    expect(await verifySessionCookie(value, 'other-secret', '2026-10-21T00:00:00Z')).toBeNull();
    expect(await verifySessionCookie('garbage', SECRET, '2026-10-21T00:00:00Z')).toBeNull();
    expect(await verifySessionCookie(`${id}.${exp}.zz`, SECRET, '2026-10-21T00:00:00Z')).toBeNull();
    expect(await verifySessionCookie('', SECRET, '2026-10-21T00:00:00Z')).toBeNull();
  });
});

describe('findPresenterByName', () => {
  it('matches the full name case-insensitively and trimmed', async () => {
    const row = await findPresenterByName(env.PMES_DB, '  juan dela cruz ');
    expect(row).toMatchObject({ id: 1, display_name: 'Juan Dela Cruz' });
  });

  it('returns null for unknown or inactive presenters', async () => {
    expect(await findPresenterByName(env.PMES_DB, 'Nobody')).toBeNull();
    expect(await findPresenterByName(env.PMES_DB, 'Retired Presenter')).toBeNull();
  });
});

describe('requirePresenter', () => {
  const app = new Hono<PresenterApp>();
  app.get('/me', requirePresenter, c => c.json(c.var.presenter));
  const testEnv = { ...env, PMES_SESSION_SECRET: SECRET };
  const get = (cookie?: string) => app.request('/me', { headers: cookie ? { Cookie: cookie } : {} }, testEnv);

  it('returns 401 without a cookie', async () => {
    const res = await get();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('sets c.var.presenter for a valid cookie', async () => {
    const res = await get(`pmes_admin=${await signSession(1, future, SECRET)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 1, displayName: 'Juan Dela Cruz' });
  });

  it('returns 401 for an expired cookie, a tampered cookie, or an inactive presenter', async () => {
    expect((await get(`pmes_admin=${await signSession(1, past, SECRET)}`)).status).toBe(401);
    expect((await get(`pmes_admin=1.${future}.deadbeef`)).status).toBe(401);
    expect((await get(`pmes_admin=${await signSession(2, future, SECRET)}`)).status).toBe(401);
  });
});
