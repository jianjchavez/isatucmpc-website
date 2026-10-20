// Presenter passwords and the signed admin cookie (spec §5 admin, §6 passwords). WebCrypto only.
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { PmesEnv } from './env';

export const ADMIN_COOKIE = 'pmes_admin';
const PBKDF2_ITERATIONS = 100000;
const enc = new TextEncoder();

export type PresenterRow = {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  active: number;
};

export type PresenterApp = {
  Bindings: PmesEnv;
  Variables: { presenter: { id: number; displayName: string } };
};

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error('malformed hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return toHex(bits);
}

export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = salt ? fromHex(salt) : crypto.getRandomValues(new Uint8Array(16));
  return { hash: await pbkdf2(password, saltBytes), salt: toHex(saltBytes) };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  try {
    const expected = fromHex(hash);
    const actual = fromHex(await pbkdf2(password, fromHex(salt)));
    if (expected.length !== actual.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
    return diff === 0;
  } catch {
    return false;
  }
}

const hmacKey = (secret: string, usage: KeyUsage) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

/** Cookie value `${presenterId}.${expiresAt}.${sigHex}`; expiresAt is Unix epoch milliseconds. */
export async function signSession(presenterId: number, expiresAt: number, secret: string): Promise<string> {
  const payload = `${presenterId}.${expiresAt}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(payload));
  return `${payload}.${toHex(sig)}`;
}

export async function verifySessionCookie(
  value: string,
  secret: string,
  nowIso: string,
): Promise<{ presenterId: number } | null> {
  try {
    const [id, exp, sigHex, extra] = value.split('.');
    if (extra !== undefined || !/^\d+$/.test(id) || !/^\d+$/.test(exp)) return null;
    // subtle.verify is a constant-time comparison of the MAC.
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), fromHex(sigHex), enc.encode(`${id}.${exp}`));
    if (!ok || Date.parse(nowIso) >= Number(exp)) return null;
    return { presenterId: Number(id) };
  } catch {
    return null;
  }
}

export async function findPresenterByName(db: D1Database, name: string): Promise<PresenterRow | null> {
  return db
    .prepare('SELECT * FROM pmes_presenters WHERE lower(username) = lower(?) AND active = 1')
    .bind(name.trim())
    .first<PresenterRow>();
}

export const requirePresenter: MiddlewareHandler<PresenterApp> = async (c, next) => {
  const value = getCookie(c, ADMIN_COOKIE);
  const session = value ? await verifySessionCookie(value, c.env.PMES_SESSION_SECRET, new Date().toISOString()) : null;
  const row = session
    ? await c.env.PMES_DB.prepare('SELECT id, display_name FROM pmes_presenters WHERE id = ? AND active = 1')
        .bind(session.presenterId)
        .first<{ id: number; display_name: string }>()
    : null;
  if (!row) return c.json({ error: 'unauthorized' }, 401);
  c.set('presenter', { id: row.id, displayName: row.display_name });
  await next();
};
