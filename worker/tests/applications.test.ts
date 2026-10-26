import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { findApplication, issueApplicationNo, normalizeMobile } from '../src/membership/applications';

const db = () => env.PMES_DB;

beforeEach(async () => {
  await db().batch([
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
