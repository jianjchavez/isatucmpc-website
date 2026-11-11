import { normalizeMobile } from './applications';

export type Person = { name: string; dateOfBirth: string; contact: string };

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
export type WebsiteApplicationRecordInput = Omit<WebsiteApplicationRecord, 'version' | 'applicationNo' | 'submittedAt'>;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-applicant');
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 200): string {
  if (typeof value !== 'string') throw new Error('invalid-applicant');
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error('invalid-applicant');
  return trimmed;
}
function date(value: unknown, required = false): string {
  const s = text(value);
  if (!s && !required) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('invalid-applicant');
  const d = new Date(`${s}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s || s.startsWith('0000')) {
    throw new Error('invalid-applicant');
  }
  return s;
}
function enumeration<T extends string>(value: unknown, allowed: readonly T[]): T {
  const s = text(value);
  if (!allowed.includes(s as T)) throw new Error('invalid-applicant');
  return s as T;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('invalid-applicant');
  return value;
}
function whole(value: unknown, min: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) throw new Error('invalid-applicant');
  return value;
}
function person(value: unknown): Person {
  const p = object(value);
  return { name: text(p.name), dateOfBirth: date(p.dateOfBirth), contact: text(p.contact) };
}

/** Strict public input boundary. Returns only contract fields; errors never include input. */
export function parseApplicationRecord(raw: unknown): WebsiteApplicationRecordInput | null {
  if (typeof raw !== 'string' || raw.length > 16 * 1024 || new TextEncoder().encode(raw).byteLength > 16 * 1024) return null;
  try {
    const v = object(JSON.parse(raw));
    const firstName = text(v.firstName);
    const lastName = text(v.lastName);
    const dateOfBirth = date(v.dateOfBirth, true);
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const age = Number(today.slice(0, 4)) - Number(dateOfBirth.slice(0, 4)) -
      (today.slice(5) < dateOfBirth.slice(5) ? 1 : 0);
    if (!firstName || !lastName || age < 18) return null;
    const contactNumber = normalizeMobile(text(v.contactNumber));
    const email = text(v.email);
    if (!contactNumber || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    if (!Array.isArray(v.beneficiaries) || v.beneficiaries.length > 2) return null;
    const recommender = object(v.recommender);
    const emergency = object(v.emergencyContact);
    return {
      firstName, middleName: text(v.middleName), lastName, extension: text(v.extension),
      email, contactNumber, dateOfBirth, placeOfBirth: text(v.placeOfBirth),
      gender: enumeration(v.gender, ['', 'Male', 'Female'] as const),
      civilStatus: enumeration(v.civilStatus, ['', 'Single', 'Married', 'Separated'] as const),
      presentAddress: text(v.presentAddress), permanentAddress: text(v.permanentAddress),
      tinNumber: text(v.tinNumber), gsisSssNumber: text(v.gsisSssNumber),
      validIdType: text(v.validIdType), validIdNumber: text(v.validIdNumber),
      membershipType: enumeration(v.membershipType, ['', 'Regular', 'Associate'] as const),
      isatuEmployee: bool(v.isatuEmployee), campus: text(v.campus),
      employmentCategory: text(v.employmentCategory), statusOfEmployment: text(v.statusOfEmployment), profession: text(v.profession),
      associateQualification: enumeration(v.associateQualification, ['', 'relationship', 'integrity', 'organization'] as const),
      associateSpecify: text(v.associateSpecify),
      recommender: { name: text(recommender.name), relationship: text(recommender.relationship), campus: text(recommender.campus) },
      spouse: person(v.spouse), parent: person(v.parent),
      beneficiaries: v.beneficiaries.map(value => {
        const b = object(value);
        return { fullName: text(b.fullName), dateOfBirth: date(b.dateOfBirth), relationship: text(b.relationship) };
      }),
      emergencyContact: { name: text(emergency.name), phone: text(emergency.phone), relationship: text(emergency.relationship) },
      notes: text(v.notes, 1000), shares: whole(v.shares, 500), years: whole(v.years, 1), privacyConsent: bool(v.privacyConsent),
    };
  } catch {
    return null;
  }
}
