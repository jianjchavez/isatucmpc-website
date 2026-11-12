import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { findApplication, issueApplicationNo, normalizeMobile, storeApplicationPayload, getApplicationPayload, deletePayload } from '../src/membership/applications';

import { applicantFixture } from './fixtures/application-record';

const db = () => env.PMES_DB;

beforeEach(async () => {
  await db().batch([
    db().prepare('DELETE FROM application_payloads'),
    db().prepare('DELETE FROM membership_applications'),
    db().prepare('DELETE FROM application_counters'),
  ]);
});

describe('applications', () => {
  it('issues APP-2026-0001 then APP-2026-0002 within a year and restarts at 0001 next year', async () => {
    const applicant = { fullName: 'Juan Dela Cruz', mobile: '09171234567', email: 'juan@example.com' };
    expect(await issueApplicationNo(db(), applicant, '2026-12-31T15:59:59Z')).toBe('APP-2026-0001');
    expect(await issueApplicationNo(db(), applicant, '2026-12-31T15:59:59Z')).toBe('APP-2026-0002');
    expect(await issueApplicationNo(db(), applicant, '2026-12-31T16:00:00Z')).toBe('APP-2027-0001');
  });

  it('normalizeMobile accepts local and country-code formats and rejects invalid numbers', () => {
    expect(normalizeMobile('0917 123 4567')).toBe('09171234567');
    expect(normalizeMobile('+63 917 123 4567')).toBe('09171234567');
    expect(normalizeMobile('12345')).toBe('');
  });

  it('findApplication returns the stored row and null for an unknown number', async () => {
    const applicant = { fullName: 'Juan Dela Cruz', mobile: '09171234567', email: 'juan@example.com' };
    const no = await issueApplicationNo(db(), applicant, '2026-10-26T00:00:00Z');
    expect(await findApplication(db(), no)).toEqual({ no, ...applicant });
    expect(await findApplication(db(), 'APP-2026-9999')).toBeNull();
  });
});

describe('application payload persistence', () => {
  it('stores server metadata, reads missing payloads as null, and acknowledges atomically', async () => {
    const now = '2026-11-11T00:00:00Z';
    const no = await issueApplicationNo(db(), { fullName: 'Fixture Applicant', mobile: '09171234567', email: 'fixture@example.com' }, now);
    expect(await getApplicationPayload(db(), no)).toBeNull();
    await storeApplicationPayload(db(), no, applicantFixture(), now);
    expect(await getApplicationPayload(db(), no)).toEqual({ ...applicantFixture(), version: 1, applicationNo: no, submittedAt: now });
    await deletePayload(db(), no, '2026-11-12T00:00:00Z');
    expect(await getApplicationPayload(db(), no)).toBeNull();
    expect(await db().prepare('SELECT pulled_at, full_name FROM membership_applications WHERE no = ?').bind(no).first())
      .toEqual({ pulled_at: '2026-11-12T00:00:00Z', full_name: 'Fixture Applicant' });
    await deletePayload(db(), no, '2026-11-13T00:00:00Z');
    expect(await db().prepare('SELECT pulled_at FROM membership_applications WHERE no = ?').bind(no).first())
      .toEqual({ pulled_at: '2026-11-12T00:00:00Z' });
  });
  it('does not mark a never-stored application as pulled', async () => {
    const no = await issueApplicationNo(db(), { fullName: 'Fixture Applicant', mobile: '09171234567', email: 'fixture@example.com' }, '2026-11-11T00:00:00Z');
    await deletePayload(db(), no, '2026-11-12T00:00:00Z');
    expect(await db().prepare('SELECT pulled_at FROM membership_applications WHERE no = ?').bind(no).first()).toEqual({ pulled_at: null });
  });
  it('allocates distinct numbers and matching payloads under concurrent submissions', async () => {
    const numbers = await Promise.all(Array.from({ length: 8 }, (_, i) => issueApplicationNo(db(),
      { fullName: 'Fixture Applicant', mobile: '09171234567', email: 'fixture@example.com' }, '2026-11-11T00:00:00Z',
      { ...applicantFixture(), notes: `fixture-${i}` })));
    expect(new Set(numbers).size).toBe(8);
    for (const [i, no] of numbers.entries()) {
      expect(await getApplicationPayload(db(), no)).toMatchObject({ applicationNo: no, notes: `fixture-${i}` });
    }
  });
});
