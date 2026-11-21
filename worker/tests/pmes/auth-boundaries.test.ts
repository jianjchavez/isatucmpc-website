import { describe, expect, it } from 'vitest';
import { hashPassword, signSession, verifyPassword, verifySessionToken } from '../../src/pmes/auth';

const SECRET = 'test-session-secret';
const EXPIRY = Date.parse('2026-11-21T12:00:00.000Z');

describe('presenter authentication boundaries', () => {
  it.each(['.', '.extra'])('rejects a valid signed token with an extra segment %s', async suffix => {
    const token = await signSession(7, EXPIRY, SECRET);
    expect(await verifySessionToken(token + suffix, SECRET, '2026-11-21T11:59:59.999Z')).toBeNull();
  });
  it('expires at the exact millisecond, with the previous millisecond still valid', async () => {
    const token = await signSession(7, EXPIRY, SECRET);
    expect(await verifySessionToken(token, SECRET, '2026-11-21T11:59:59.999Z')).toEqual({ presenterId: 7 });
    expect(await verifySessionToken(token, SECRET, '2026-11-21T12:00:00.000Z')).toBeNull();
  });
  it.each(['', 'a'.repeat(63), 'g'.repeat(64), '00'])('refuses a malformed or wrong-length stored password hash %# without throwing', async hash => {
    await expect(verifyPassword('test-password', hash, '00112233445566778899aabbccddeeff')).resolves.toBe(false);
  });
  it('compares decoded hex bytes, including uppercase stored hash and salt', async () => {
    const { hash, salt } = await hashPassword('test-password', '00112233445566778899aabbccddeeff');
    expect(await verifyPassword('test-password', hash.toUpperCase(), salt.toUpperCase())).toBe(true);
    expect(await verifyPassword('different-password', hash.toUpperCase(), salt.toUpperCase())).toBe(false);
  });
});
