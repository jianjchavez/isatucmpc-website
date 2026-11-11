import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseApplicationRecord } from '../src/membership/record';
import { applicantFixture } from './fixtures/application-record';

afterEach(() => vi.useRealTimers());
const parse = (patch: Record<string, unknown> = {}) => parseApplicationRecord(JSON.stringify({ ...applicantFixture(), ...patch }));

describe('application record validation', () => {
  it('trims nested strings, normalizes mobile, strips unknown keys and client metadata', () => {
    const result = parse({ firstName: ' Fixture ', contactNumber: '+63 917 123 4567',
      spouse: { name: ' Spouse ', dateOfBirth: '', contact: '', extra: 'discard' },
      version: 99, applicationNo: 'forged', submittedAt: 'forged', unexpected: 'discard' });
    expect(result).toEqual({ ...applicantFixture(), firstName: 'Fixture',
      spouse: { name: 'Spouse', dateOfBirth: '', contact: '' } });
  });
  it('keeps free-text campus, ID type and employment values for MemberFolio mapping', () => {
    expect(parse({ campus: 'Unknown campus', statusOfEmployment: 'Permanent', validIdType: 'Other' }))
      .toMatchObject({ campus: 'Unknown campus', statusOfEmployment: 'Permanent', validIdType: 'Other' });
  });
  it.each([
    { firstName: '' }, { lastName: '   ' }, { firstName: null }, { middleName: undefined },
    { dateOfBirth: '2000-02-30' }, { dateOfBirth: '2000-13-01' }, { dateOfBirth: '01/01/1990' },
    { dateOfBirth: '' }, { dateOfBirth: '2099-01-01' },
    { gender: 'Other' }, { civilStatus: 'Widowed' }, { membershipType: 'regular' },
    { associateQualification: 'other' }, { notes: 'x'.repeat(1001) }, { campus: 'x'.repeat(201) },
    { spouse: { name: 'x'.repeat(201), dateOfBirth: '', contact: '' } },
    { parent: { name: '', dateOfBirth: '2000-02-30', contact: '' } },
    { emergencyContact: null }, { recommender: [] }, { spouse: {} },
    { beneficiaries: [{}, {}, {}] }, { beneficiaries: [{ fullName: 'Child', dateOfBirth: 'bad', relationship: '' }] },
    { beneficiaries: 'bad' }, { privacyConsent: 'true' }, { isatuEmployee: 1 },
    { shares: '500' }, { shares: 499 }, { shares: 500.5 }, { years: 0 }, { years: 1.5 },
    { email: 'invalid' }, { contactNumber: '12345' },
  ])('rejects invalid contract value %#', patch => expect(parse(patch)).toBeNull());
  it.each([undefined, null, {}, [], 1, 'null', '[]', '{bad'])('rejects malformed raw input %#', raw => {
    expect(parseApplicationRecord(raw)).toBeNull();
  });
  it('limits raw UTF-8 JSON to 16 KiB, including ignored fields and whitespace', () => {
    const base = JSON.stringify(applicantFixture());
    expect(parseApplicationRecord(base.padEnd(16384))).not.toBeNull();
    expect(parseApplicationRecord(base.padEnd(16385))).toBeNull();
    expect(parse({ extra: '界'.repeat(5500) })).toBeNull();
  });
  it('allows maximum lengths, blank enums, two beneficiaries, and a real leap date', () => {
    expect(parse({ firstName: 'x'.repeat(200), notes: 'x'.repeat(1000), dateOfBirth: '2000-02-29',
      gender: '', civilStatus: '', membershipType: '', associateQualification: '',
      beneficiaries: [applicantFixture().beneficiaries[0], applicantFixture().beneficiaries[0]] })).not.toBeNull();
  });
  it('measures text and notes limits after trimming whitespace', () => {
    expect(parse({ firstName: 'x'.repeat(200) + ' '.repeat(20),
      notes: 'x'.repeat(1000) + ' '.repeat(20),
      spouse: { name: 'x'.repeat(200) + ' '.repeat(20), dateOfBirth: '', contact: '' } }))
      .toMatchObject({ firstName: 'x'.repeat(200), notes: 'x'.repeat(1000),
        spouse: { name: 'x'.repeat(200), dateOfBirth: '', contact: '' } });
  });
  it('uses the Manila calendar day for the exact eighteenth birthday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T15:59:59Z'));
    expect(parse({ dateOfBirth: '2008-11-11' })).toBeNull();
    vi.setSystemTime(new Date('2026-11-10T16:00:00Z'));
    expect(parse({ dateOfBirth: '2008-11-11' })).not.toBeNull();
  });
});
