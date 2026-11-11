import { PAR_VALUE, formatAmount } from './subscription';

export const VALID_ID_TYPES = [
  { value: 'PhilID', label: 'Philippine Identification (PhilID)' },
  { value: 'Passport', label: 'Passport' },
  { value: 'SSS', label: 'SSS ID' },
  { value: 'GSIS', label: 'GSIS ID' },
  { value: 'TIN', label: 'TIN ID' },
  { value: 'Drivers License', label: "Driver's License" },
  { value: 'Voters ID', label: "Voter's ID" },
  { value: 'PRC', label: 'PRC ID' },
  { value: 'Postal', label: 'Postal ID' },
  { value: 'Barangay ID', label: 'Barangay ID' },
  { value: 'Senior Citizen', label: 'Senior Citizen ID' },
] as const;

export const EMPLOYMENT_STATUSES = [
  { value: 'regular', label: 'Regular' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'casual', label: 'Casual' },
  { value: 'contractual', label: 'Contractual' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'project-based', label: 'Project-based' },
  { value: 'retired', label: 'Retired' },
  { value: 'not-applicable', label: 'Not applicable' },
] as const;

type Person = { name: string; dateOfBirth: string; contact: string };

export type WebsiteApplicationRecord = {
  version: 1;
  applicationNo: string;
  submittedAt: string;
  firstName: string; middleName: string; lastName: string; extension: string;
  email: string; contactNumber: string;
  dateOfBirth: string; placeOfBirth: string;
  gender: '' | 'Male' | 'Female';
  civilStatus: '' | 'Single' | 'Married' | 'Separated';
  presentAddress: string; permanentAddress: string;
  tinNumber: string; gsisSssNumber: string;
  validIdType: string; validIdNumber: string;
  membershipType: '' | 'Regular' | 'Associate';
  isatuEmployee: boolean; campus: string;
  employmentCategory: string; statusOfEmployment: string; profession: string;
  associateQualification: '' | 'relationship' | 'integrity' | 'organization';
  associateSpecify: string;
  recommender: { name: string; relationship: string; campus: string };
  spouse: Person; parent: Person;
  beneficiaries: Array<{ fullName: string; dateOfBirth: string; relationship: string }>;
  emergencyContact: { name: string; phone: string; relationship: string };
  notes: string;
  shares: number; years: number;
  privacyConsent: boolean;
};

export type ApplicantRecord = Omit<WebsiteApplicationRecord, 'version' | 'applicationNo' | 'submittedAt'>;

type Flags = { isatuEmployee: boolean; consent: boolean; shares: number; years: number };
type Read = (field: string) => string;
type Checked = (name: string) => string;

export function buildApplicantRecord(read: Read, checked: Checked, flags: Flags): ApplicantRecord {
  const value = (field: string) => read(field).trim();
  const selected = <T extends string>(field: string, options: readonly T[]): T | '' => {
    const v = checked(field).trim();
    return options.find(option => option === v) ?? '';
  };
  const membershipType = selected('memberType', ['Regular', 'Associate'] as const);
  const regular = membershipType === 'Regular';
  const associate = membershipType === 'Associate';

  return {
    firstName: value('firstName'), middleName: value('middleName'), lastName: value('lastName'),
    extension: value('extension'), email: value('email'), contactNumber: value('contactNumber'),
    dateOfBirth: value('dob'), placeOfBirth: value('placeOfBirth'),
    gender: selected('gender', ['Male', 'Female'] as const),
    civilStatus: selected('civilStatus', ['Single', 'Married', 'Separated'] as const),
    presentAddress: value('presentHomeAddress'), permanentAddress: value('homeAddress'),
    tinNumber: value('tinNumber'), gsisSssNumber: value('gsisSssNumber'),
    validIdType: value('validIdType'), validIdNumber: value('validIdNumber'),
    membershipType, isatuEmployee: regular && flags.isatuEmployee,
    campus: regular && flags.isatuEmployee ? value('campus') : '',
    employmentCategory: selected('employmentCategory', ['Employed', 'Self-Employed', 'Retired', 'Unemployed', 'Others']),
    statusOfEmployment: value('statusOfEmployment'), profession: value('profession'),
    associateQualification: associate ? selected('associateQualification', ['relationship', 'integrity', 'organization'] as const) : '',
    associateSpecify: associate ? value('associateOrgSpecify') : '',
    recommender: {
      name: associate ? value('recommenderName') : '',
      relationship: associate ? value('recommenderRelationship') : '',
      campus: associate ? value('recommenderCampus') : '',
    },
    spouse: { name: value('spouseName'), dateOfBirth: value('spouseDob'), contact: value('spouseContact') },
    parent: { name: value('parentName'), dateOfBirth: value('parentDob'), contact: value('parentContact') },
    beneficiaries: [1, 2].map(i => ({
      fullName: value(`ben${i}Name`), dateOfBirth: value(`ben${i}Dob`),
      relationship: value(`ben${i}Rel`),
    })).filter(beneficiary => beneficiary.fullName),
    emergencyContact: {
      name: value('emergencyName'), phone: value('emergencyContact'),
      relationship: value('emergencyRelationship'),
    },
    notes: value('notes'), shares: flags.shares, years: flags.years,
    privacyConsent: flags.consent,
  };
}

export function buildApplicantMessage(read: Read, checked: Checked, flags: Flags): string {
  const r = buildApplicantRecord(read, checked, flags);
  const person = (p: { name: string; dateOfBirth: string; contact: string }) =>
    [p.name, p.dateOfBirth, p.contact].filter(Boolean).join(' / ');
  const rows: Array<[string, string]> = [
    ['Membership type', r.membershipType], ['Contact number', r.contactNumber],
    ['Date of birth', r.dateOfBirth], ['Place of birth', r.placeOfBirth],
    ['Gender', r.gender], ['Civil status', r.civilStatus],
    ['Present home address', r.presentAddress], ['Permanent home address', r.permanentAddress],
    ['TIN', r.tinNumber], ['GSIS/SSS', r.gsisSssNumber],
    ['Valid ID type', VALID_ID_TYPES.find(type => type.value === r.validIdType)?.label ?? r.validIdType],
    ['Valid ID number', r.validIdNumber],
    ['Employment category', r.employmentCategory],
    ['Status of employment', EMPLOYMENT_STATUSES.find(status => status.value === r.statusOfEmployment)?.label ?? r.statusOfEmployment],
    ['Profession', r.profession],
    ['Emergency contact', [r.emergencyContact.name, r.emergencyContact.phone, r.emergencyContact.relationship].filter(Boolean).join(' / ')],
    ['ISAT U employee', r.membershipType === 'Regular' ? (r.isatuEmployee ? 'Yes' : 'No') : ''],
    ['Campus', r.campus], ['Associate qualification', r.associateQualification],
    ['Associate specify', r.associateSpecify], ['Recommender', r.recommender.name],
    ['Recommender relationship', r.recommender.relationship], ['Recommender campus', r.recommender.campus],
    ['Spouse', person(r.spouse)], ['Parent', person(r.parent)],
    ...[1, 2].map((i): [string, string] => [
      `Beneficiary ${i}`,
      [read(`ben${i}Name`).trim(), read(`ben${i}Dob`).trim(), read(`ben${i}Rel`).trim(), read(`ben${i}Age`).trim()].filter(Boolean).join(' / '),
    ]),
    ['Connection', read('affiliation').trim()], ['Notes', r.notes],
    ['Share subscription', `${r.shares} shares (PHP ${formatAmount(r.shares * PAR_VALUE)}), paid over ${r.years} years`],
    ['Privacy consent', r.privacyConsent ? 'Given — Privacy Notice v2026-08' : ''],
  ];
  return rows.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join('\n') || '(no details)';
}

export function isAdultApplicant(dateOfBirth: string, today = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;
  const age = today.getFullYear() - year -
    (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day) ? 1 : 0);
  return age >= 18;
}
