import { describe, expect, it } from 'vitest';
import { buildApplicantRecord, buildApplicantMessage, isAdultApplicant, VALID_ID_TYPES } from '../src/lib/membership-record';

const fields: Record<string, string> = {
  firstName: '  Ana ', middleName: ' M. ', lastName: ' Reyes ', extension: '',
  email: ' ana@example.com ', contactNumber: ' 09123456789 ', dob: '1990-06-15',
  placeOfBirth: ' Iloilo ', gender: 'Female', civilStatus: 'Single',
  presentHomeAddress: ' Current address ', homeAddress: ' Permanent address ',
  tinNumber: '123-456-789', gsisSssNumber: '34-1234567-8', validIdType: 'PhilID',
  validIdNumber: '1234', memberType: 'Regular', campus: 'Leon',
  employmentCategory: 'Employed', statusOfEmployment: 'regular', profession: ' Teacher ',
  spouseName: ' Sam ', spouseDob: '1989-01-01', spouseContact: '09998887777',
  parentName: ' Pat ', parentDob: '1960-01-01', parentContact: '09111111111',
  ben1Name: ' Bea ', ben1Dob: '2015-03-01', ben1Rel: 'Child',
  ben2Name: '', ben2Dob: '', ben2Rel: '', emergencyName: ' Leo ',
  emergencyContact: '09222222222', emergencyRelationship: 'Sibling',
  recommenderName: '', recommenderRelationship: '', recommenderCampus: '',
  associateQualification: '', associateOrgSpecify: '', notes: ' Please call first ',
};
const read = (field: string) => fields[field] ?? '';
const checked = (name: string) => fields[name] ?? '';

describe('membership applicant record', () => {
  it('packs every contract field for a Regular applicant and omits a blank beneficiary', () => {
    expect(buildApplicantRecord(read, checked, { isatuEmployee: true, consent: true, shares: 20, years: 2 })).toEqual({
      firstName: 'Ana', middleName: 'M.', lastName: 'Reyes', extension: '',
      email: 'ana@example.com', contactNumber: '09123456789', dateOfBirth: '1990-06-15',
      placeOfBirth: 'Iloilo', gender: 'Female', civilStatus: 'Single',
      presentAddress: 'Current address', permanentAddress: 'Permanent address',
      tinNumber: '123-456-789', gsisSssNumber: '34-1234567-8',
      validIdType: 'PhilID', validIdNumber: '1234', membershipType: 'Regular',
      isatuEmployee: true, campus: 'Leon', employmentCategory: 'Employed',
      statusOfEmployment: 'regular', profession: 'Teacher', associateQualification: '',
      associateSpecify: '', recommender: { name: '', relationship: '', campus: '' },
      spouse: { name: 'Sam', dateOfBirth: '1989-01-01', contact: '09998887777' },
      parent: { name: 'Pat', dateOfBirth: '1960-01-01', contact: '09111111111' },
      beneficiaries: [{ fullName: 'Bea', dateOfBirth: '2015-03-01', relationship: 'Child' }],
      emergencyContact: { name: 'Leo', phone: '09222222222', relationship: 'Sibling' },
      notes: 'Please call first', shares: 20, years: 2, privacyConsent: true,
    });
  });

  it('clears Regular-only fields for an Associate', () => {
    const associate: Record<string, string> = { ...fields, memberType: 'Associate', associateQualification: 'relationship', recommenderName: 'Mia' };
    const record = buildApplicantRecord(field => associate[field] ?? '', field => associate[field] ?? '', {
      isatuEmployee: true, consent: true, shares: 10, years: 1,
    });
    expect(record.campus).toBe('');
    expect(record.isatuEmployee).toBe(false);
    expect(record.associateQualification).toBe('relationship');
    expect(record.recommender.name).toBe('Mia');
  });

  it('keeps the new ID and GSIS/SSS values in the existing message', () => {
    const message = buildApplicantMessage(read, checked, { isatuEmployee: true, consent: true, shares: 20, years: 2 });
    expect(message).toContain('Valid ID type: Philippine Identification (PhilID)');
    expect(message).toContain('GSIS/SSS: 34-1234567-8');
    expect(message).toContain('Valid ID number: 1234');
  });

  it('clears previously filled Associate fields after switching to Regular', () => {
    const inputs = { ...fields, memberType: 'Associate', associateQualification: 'organization',
      associateOrgSpecify: 'Fixture organization', recommenderName: 'Mia',
      recommenderRelationship: 'Colleague', recommenderCampus: 'Leon' };
    const readInput = (field: string) => inputs[field as keyof typeof inputs] ?? '';
    const flags = { isatuEmployee: true, consent: true, shares: 500, years: 1 };
    expect(buildApplicantRecord(readInput, readInput, flags).associateSpecify).toBe('Fixture organization');
    inputs.memberType = 'Regular';
    expect(buildApplicantRecord(readInput, readInput, flags)).toMatchObject({
      associateQualification: '', associateSpecify: '',
      recommender: { name: '', relationship: '', campus: '' },
    });
  });

  it.each([
    ['regular', 'Regular'], ['part-time', 'Part-time'], ['casual', 'Casual'],
    ['contractual', 'Contractual'], ['seasonal', 'Seasonal'], ['project-based', 'Project-based'],
    ['retired', 'Retired'], ['not-applicable', 'Not applicable'],
  ])('prints the employment label for %s while retaining its record value', (value, label) => {
    const readInput = (field: string) => field === 'statusOfEmployment' ? value : read(field);
    const flags = { isatuEmployee: true, consent: true, shares: 500, years: 1 };
    expect(buildApplicantRecord(readInput, checked, flags).statusOfEmployment).toBe(value);
    expect(buildApplicantMessage(readInput, checked, flags).split('\n')).toContain(`Status of employment: ${label}`);
  });

  it.each([
    ['PhilID', 'Philippine Identification (PhilID)'], ['Passport', 'Passport'],
    ['SSS', 'SSS ID'], ['GSIS', 'GSIS ID'], ['TIN', 'TIN ID'],
    ['Drivers License', "Driver's License"], ['Voters ID', "Voter's ID"],
    ['PRC', 'PRC ID'], ['Postal', 'Postal ID'], ['Barangay ID', 'Barangay ID'],
    ['Senior Citizen', 'Senior Citizen ID'],
  ])('provides the MemberFolio option and message label for %s', (value, label) => {
    const readInput = (field: string) => field === 'validIdType' ? value : read(field);
    const flags = { isatuEmployee: true, consent: true, shares: 500, years: 1 };
    expect(buildApplicantRecord(readInput, checked, flags).validIdType).toBe(value);
    expect(buildApplicantMessage(readInput, checked, flags).split('\n')).toContain(`Valid ID type: ${label}`);
    expect(VALID_ID_TYPES).toContainEqual({ value, label });
  });

  it.each([
    ['memberType', 'membershipType'], ['gender', 'gender'], ['civilStatus', 'civilStatus'],
    ['associateQualification', 'associateQualification'], ['employmentCategory', 'employmentCategory'],
  ])('clears a checked value outside the %s domain', (field, output) => {
    const checkedInput = (name: string) => name === field ? 'unknown' : name === 'memberType' ? 'Associate' : checked(name);
    const record = buildApplicantRecord(read, checkedInput, { isatuEmployee: true, consent: true, shares: 500, years: 1 });
    expect(record[output as keyof typeof record]).toBe('');
  });

  it('requires the eighteenth birthday to have occurred by submission day', () => {
    expect(isAdultApplicant('2008-11-11', new Date('2026-11-11T12:00:00+08:00'))).toBe(true);
    expect(isAdultApplicant('2008-11-12', new Date('2026-11-11T12:00:00+08:00'))).toBe(false);
    expect(isAdultApplicant('', new Date('2026-11-11T12:00:00+08:00'))).toBe(false);
  });
});
