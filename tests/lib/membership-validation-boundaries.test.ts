import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApplicantRecord, deductionLine, isAdultApplicant } from '~/lib/membership-record';
import { parseApplicationRecord } from '../../worker/src/membership/record';

const fields: Record<string, string> = {
  firstName: 'Test', lastName: 'Member A', email: 'member@example.com',
  contactNumber: '09171234567', dob: '1990-01-01', memberType: 'Regular', pmesMode: 'online',
};
function applicant(patch: Record<string, string> = {}) {
  const values = { ...fields, ...patch };
  const read = (key: string) => values[key] ?? '';
  return buildApplicantRecord(read, read, { isatuEmployee: false, consent: true, shares: 50, years: 1 });
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('membership client and worker boundary', () => {
  it.each(['2001-02-29', '2000-02-30', '0000-01-01'])('rejects impossible birth date %s on both sides', dateOfBirth => {
    expect(isAdultApplicant(dateOfBirth, new Date(2026, 10, 21))).toBe(false);
    expect(parseApplicationRecord(JSON.stringify(applicant({ dob: dateOfBirth })))).toBeNull();
  });
  it('keeps a leap-day applicant under 18 through February 28 in a non-leap year', () => {
    expect(isAdultApplicant('2008-02-29', new Date(2026, 1, 28))).toBe(false);
    expect(isAdultApplicant('2008-02-29', new Date(2026, 2, 1))).toBe(true);
  });
  it('omits deductions for fully paid shares after welfare eligibility and for incomplete inputs', () => {
    const input = { isatuEmployee: true, shares: 50, years: 3, dateOfBirth: '1970-11-21' };
    expect(deductionLine(input, '2026-11-21')).toBe('');
    expect(deductionLine({ ...input, shares: 51 }, '2026-11-21')).toBe('PHP 1.39 capital share a month for 36 months');
    for (const patch of [{ isatuEmployee: false }, { shares: 49 }, { years: 0 }, { dateOfBirth: '' }]) {
      expect(deductionLine({ ...input, ...patch }, '2026-11-21')).toBe('');
    }
  });
  it('produces a worker-compatible record while preserving the entered phone format until submission', () => {
    const built = applicant({ firstName: ' Test ', contactNumber: '+63 917 123 4567' });
    const parsed = parseApplicationRecord(JSON.stringify(built));
    expect(built.firstName).toBe('Test');
    expect(built.contactNumber).toBe('+63 917 123 4567');
    expect(parsed).toEqual({ ...built, contactNumber: '09171234567' });
  });
  it('pins the browser-local versus Manila eighteenth-birthday difference', () => {
    // NOTE: The client uses browser-local calendar fields; the worker uses Manila.
    // A user west of Manila can be refused locally even though the worker accepts their birthday.
    vi.stubEnv('TZ', 'UTC');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-21T16:00:00.000Z'));
    expect(isAdultApplicant('2008-11-22')).toBe(false);
    expect(parseApplicationRecord(JSON.stringify(applicant({ dob: '2008-11-22' }))))
      .toMatchObject({ dateOfBirth: '2008-11-22' });
  });
});
