import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { issueCertificate, getCertificate, getVerification } from '../../src/pmes/certificates';

const db = () => env.PMES_DB;
const SITE = 'https://isatucmpc.coop';
const DRAW = JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, optionOrder: [0, 1, 2, 3] })));

async function seedSession(): Promise<number> {
  await db()
    .prepare(
      "INSERT INTO pmes_presenters (id, username, display_name, password_hash, password_salt, created_at) VALUES (1, 'presenter', 'Presenter', 'h', 's', '2026-10-21T00:00:00Z')",
    )
    .run();
  const row = await db()
    .prepare(
      "INSERT INTO pmes_sessions (code, session_date, venue, presenter_name, chair_name, presenter_id, created_at) VALUES ('PMES-AB23', '2026-10-24', 'ISATU Main Campus', 'Presenter Name', 'Chair Name', 1, '2026-10-21T00:00:00Z') RETURNING id",
    )
    .first<{ id: number }>();
  return row!.id;
}

async function seedAttempt(sessionId: number, idNumber: string, passed = 1, score = 18): Promise<string> {
  const id = crypto.randomUUID().replace(/-/g, '');
  await db()
    .prepare(
      "INSERT INTO pmes_attempts (id, session_id, attempt_no, id_type, id_number, full_name, mobile, email, consent_at, draw_json, answers_json, score, passed, started_at, deadline_at, submitted_at, status) VALUES (?, ?, 1, 'application', ?, 'Attendee Name', '09171234567', 'attendee@example.com', '2026-10-24T01:00:00Z', ?, '[]', ?, ?, '2026-10-24T01:00:00Z', '2026-10-24T01:20:00Z', '2026-10-24T01:15:00Z', 'submitted')",
    )
    .bind(id, sessionId, idNumber, DRAW, score, passed)
    .run();
  return id;
}

describe('certificates', () => {
  let sessionId: number;
  beforeEach(async () => {
    // Storage is isolated per file, not per test: start each test from empty tables.
    await db().batch(
      ['pmes_certificates', 'pmes_counters', 'pmes_attempts', 'pmes_sessions', 'pmes_presenters'].map(t =>
        db().prepare(`DELETE FROM ${t}`),
      ),
    );
    sessionId = await seedSession();
  });

  it('first certificate of 2026 is PMES-2026-0001 with a 32-hex key', async () => {
    const attemptId = await seedAttempt(sessionId, 'A-1');
    const { no, key } = await issueCertificate(db(), attemptId, '2026-10-24T01:15:00Z');
    expect(no).toBe('PMES-2026-0001');
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    const row = await db().prepare('SELECT year, seq, attempt_id, issued_at, email_status FROM pmes_certificates WHERE no = ?').bind(no).first();
    expect(row).toEqual({ year: 2026, seq: 1, attempt_id: attemptId, issued_at: '2026-10-24T01:15:00Z', email_status: 'pending' });
  });

  it('25 concurrent issues produce 25 distinct consecutive numbers', async () => {
    const attemptIds = await Promise.all(Array.from({ length: 25 }, (_, i) => seedAttempt(sessionId, `A-${i}`)));
    const issued = await Promise.all(attemptIds.map(id => issueCertificate(db(), id, '2026-10-24T01:15:00Z')));
    const nos = issued.map(c => c.no).sort();
    expect(new Set(nos).size).toBe(25);
    expect(nos).toEqual(Array.from({ length: 25 }, (_, i) => `PMES-2026-${String(i + 1).padStart(4, '0')}`));
    expect(new Set(issued.map(c => c.key)).size).toBe(25);
  });

  it('a 2027 issue restarts at 0001, using the Manila date', async () => {
    const a = await seedAttempt(sessionId, 'A-1');
    const b = await seedAttempt(sessionId, 'A-2');
    expect((await issueCertificate(db(), a, '2026-12-31T10:00:00Z')).no).toBe('PMES-2026-0001');
    // 16:00Z on Dec 31 is already Jan 1 in Manila (+08:00)
    expect((await issueCertificate(db(), b, '2026-12-31T16:00:00Z')).no).toBe('PMES-2027-0001');
  });

  it('getCertificate returns the full record for the right key and null for a wrong key', async () => {
    const attemptId = await seedAttempt(sessionId, 'A-1');
    const { no, key } = await issueCertificate(db(), attemptId, '2026-10-24T01:15:00Z');
    expect(await getCertificate(db(), no, key, SITE)).toEqual({
      no,
      fullName: 'Attendee Name',
      idType: 'application',
      idNumber: 'A-1',
      sessionDate: '2026-10-24',
      venue: 'ISATU Main Campus',
      code: 'PMES-AB23',
      presenterName: 'Presenter Name',
      chairName: 'Chair Name',
      score: 18,
      total: 20,
      issuedAt: '2026-10-24T01:15:00Z',
      verifyUrl: `${SITE}/pmes/verify/?no=${no}`,
    });
    expect(await getCertificate(db(), no, 'f'.repeat(32), SITE)).toBeNull();
    expect(await getCertificate(db(), no, '', SITE)).toBeNull();
    expect(await getCertificate(db(), 'PMES-2026-9999', key, SITE)).toBeNull();
  });

  it('getVerification returns the public subset for a passed attempt and null otherwise', async () => {
    const passedId = await seedAttempt(sessionId, 'A-1');
    const { no } = await issueCertificate(db(), passedId, '2026-10-24T01:15:00Z');
    expect(await getVerification(db(), no)).toEqual({
      no,
      fullName: 'Attendee Name',
      idNumber: 'A-1',
      sessionDate: '2026-10-24',
      score: 18,
      total: 20,
      passed: true,
      presenterName: 'Presenter Name',
      issuedAt: '2026-10-24T01:15:00Z',
    });
    const failedId = await seedAttempt(sessionId, 'A-2', 0, 13);
    await expect(issueCertificate(db(), failedId, '2026-10-24T01:15:00Z')).rejects.toThrow('attempt-not-passed');
    expect(await getVerification(db(), 'PMES-2026-9999')).toBeNull();
  });
});

describe('maskId', () => {
  it('keeps only the last four characters of longer ID numbers', async () => {
    const { maskId } = await import('../../src/pmes/certificates');
    expect(maskId('2026-00123')).toBe('••••••0123');
    expect(maskId('A-1')).toBe('A-1');
  });
});
