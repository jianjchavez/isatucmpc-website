import type { WebsiteApplicationRecordInput } from '../../src/membership/record';

export const applicationRecord = {
  firstName: 'Fixture', middleName: '', lastName: 'Applicant', extension: '',
  email: 'fixture@example.com', contactNumber: '09171234567',
  dateOfBirth: '1990-01-01', placeOfBirth: 'Iloilo', gender: 'Female', civilStatus: 'Single',
  presentAddress: 'Fixture present address', permanentAddress: 'Fixture permanent address',
  tinNumber: '', gsisSssNumber: '34-1234567-8', validIdType: 'PhilID', validIdNumber: 'fixture-id',
  membershipType: 'Regular', isatuEmployee: true, campus: 'Leon',
  employmentCategory: 'Employed', statusOfEmployment: 'regular', profession: 'Teacher',
  associateQualification: '', associateSpecify: '',
  recommender: { name: '', relationship: '', campus: '' },
  spouse: { name: '', dateOfBirth: '', contact: '' },
  parent: { name: '', dateOfBirth: '', contact: '' },
  beneficiaries: [{ fullName: 'Fixture Child', dateOfBirth: '2015-01-01', relationship: 'Child' }],
  emergencyContact: { name: 'Fixture Contact', phone: '09170000000', relationship: 'Sibling' },
  notes: '', shares: 500, years: 5, privacyConsent: true,
} as const;

export function applicantFixture(): WebsiteApplicationRecordInput {
  return JSON.parse(JSON.stringify(applicationRecord));
}
