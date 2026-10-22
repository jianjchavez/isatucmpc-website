// Office copy of a website membership application: Data Privacy Consent, Depositor's
// Information Sheet and Signature Card, filled from the applicant's entry and attached to
// the coop's notification email. Template and field map are built by scripts/forms/build.py.
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import template from './office-packet.pdf';
import fields from './office-fields.json';

// Same rule as src/lib/subscription.ts; the form checks it first, this is the server copy.
export const MIN_SHARES = 500;
// Version of the website Privacy Notice the online consent checkbox refers to.
export const PRIVACY_NOTICE_VERSION = '2026-08';

export type Applicant = {
  firstName: string;
  middleName: string;
  lastName: string;
  extension: string;
  civilStatus: string;
  spouseName: string;
  contactNumber: string;
  address: string;
  privacyConsent: boolean;
};

const TEXT_KEYS = ['firstName', 'middleName', 'lastName', 'extension', 'civilStatus', 'spouseName', 'contactNumber', 'address'] as const;

/** Parses the form's `applicant` JSON; null if it is missing or malformed. */
export function parseApplicant(raw: unknown): Applicant | null {
  if (typeof raw !== 'string') return null;
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const out = { privacyConsent: v.privacyConsent === true } as Applicant;
  for (const k of TEXT_KEYS) {
    const s = v[k] ?? '';
    if (typeof s !== 'string' || s.length > 300) return null;
    out[k] = s.trim();
  }
  return out.firstName && out.lastName ? out : null;
}

/** A whole number of shares at or above the minimum, and at least one year to pay. */
export function validSubscription(shares: unknown, years: unknown): boolean {
  const whole = (x: unknown) => (typeof x === 'string' && /^\d{1,9}$/.test(x.trim()) ? Number(x) : NaN);
  return whole(shares) >= MIN_SHARES && whole(years) >= 1;
}

type Field = { page: number; x: number; top: number; maxWidth: number; size: number };

function draw(pages: PDFPage[], font: PDFFont, text: string, f: Field) {
  let str = text.trim();
  if (!str) return;
  let size = f.size;
  while (size > 6 && font.widthOfTextAtSize(str, size) > f.maxWidth) size -= 0.25;
  while (str.length > 0 && font.widthOfTextAtSize(str, size) > f.maxWidth) str = str.slice(0, -1);
  const page = pages[f.page];
  page.drawText(str, { x: f.x, y: page.getHeight() - f.top, size, font });
}

/** `consentDate` is the Manila date the application was submitted, e.g. "October 23, 2026". */
export async function buildOfficePacket(a: Applicant, consentDate: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(template);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const name = [a.firstName, a.middleName, a.lastName, a.extension].filter(Boolean).join(' ');
  const lastFirst = `${[a.lastName, a.extension].filter(Boolean).join(' ')}, ${[a.firstName, a.middleName].filter(Boolean).join(' ')}`;
  const values: Record<keyof typeof fields, string> = {
    consentName: lastFirst,
    consentDate: a.privacyConsent ? consentDate : '',
    noticeVersion: a.privacyConsent ? PRIVACY_NOTICE_VERSION : '',
    depName: name,
    depCivil: a.civilStatus,
    depSpouse: a.spouseName,
    depContact: a.contactNumber,
    depAddress: a.address,
    depSigName: name,
    cardName: name,
    cardAddress: a.address,
    cardContact: a.contactNumber,
    cardSigName: name,
    cardSingle: 'X',
  };
  for (const [key, f] of Object.entries(fields)) draw(pages, font, values[key as keyof typeof fields], f);
  return pdf.save();
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
