import type { PDFDocument as PDFDocumentType, PDFFont } from 'pdf-lib';

// PDF page coordinates: origin at bottom-left, units in points (1 pt = 1/72 in).
// Both application PDFs are A4 (595 × 842 pt).
// We author coords as { x, top } from the page TOP for readability,
// then convert to PDF y = 842 - top inside the draw helper.

export interface PdfFieldData {
  // Identity
  firstName?: string;
  middleName?: string;
  lastName?: string;
  extension?: string;
  dob?: string;
  placeOfBirth?: string;
  email?: string;
  contactNumber?: string;
  gender?: string; // 'Male' | 'Female'
  civilStatus?: string; // 'Single' | 'Married' | 'Separated'
  presentHomeAddress?: string;
  homeAddress?: string;
  tinNumber?: string;
  validIdNumber?: string;
  // Employment
  employmentCategory?: string; // 'Employed' | 'Self-Employed' | 'Retired' | 'Unemployed' | 'Others'
  statusOfEmployment?: string;
  profession?: string;
  // Emergency
  emergencyName?: string;
  emergencyContact?: string;
  emergencyRelationship?: string;
  // Regular-specific
  isatuEmployee?: boolean;
  campus?: string; // 'Main La Paz' | 'Dumangas' | 'Barotac Nuevo' | 'Leon' | 'Miag-ao'
  // Associate-specific
  associateQualification?: string; // 'relationship' | 'integrity' | 'organization'
  associateOrgSpecify?: string; // freetext if 'relationship' or 'integrity'
  recommenderName?: string;
  recommenderRelationship?: string;
  recommenderCampus?: string;
  // Family
  spouseName?: string;
  spouseDob?: string;
  spouseContact?: string;
  parentName?: string;
  parentDob?: string;
  parentContact?: string;
  // Beneficiaries (up to 3)
  beneficiaries?: Array<{ name?: string; dob?: string; relationship?: string; age?: string }>;
  // Submitted
  dateAccomplished?: string;
}

// Approximate field positions. PDF coords need iterative visual tuning —
// operator should inspect a test fill and report needed adjustments.
// All `top` values are from the page top; converted to pdf-lib's bottom-up y internally.
const PAGE_HEIGHT = 842;

type Coord = { x: number; top: number; size?: number; maxWidth?: number };

// Shared layout (both Regular and Associate share the same form template).
const SHARED: Record<string, Coord> = {
  firstName:           { x: 50,  top: 268 },
  middleName:          { x: 195, top: 268 },
  lastName:            { x: 335, top: 268 },
  extension:           { x: 470, top: 268 },

  dob:                 { x: 50,  top: 305, size: 9 },
  placeOfBirth:        { x: 130, top: 305, size: 9 },
  email:               { x: 250, top: 305, size: 9 },
  contactNumber:       { x: 405, top: 305, size: 9 },

  // Gender / Civil Status checkboxes — we just write text labels next to them
  gender:              { x: 475, top: 305, size: 9 },
  civilStatus:         { x: 525, top: 305, size: 9 },

  presentHomeAddress:  { x: 50,  top: 345, size: 9, maxWidth: 240 },
  homeAddress:         { x: 305, top: 345, size: 9, maxWidth: 240 },

  tinNumber:           { x: 50,  top: 390, size: 9 },
  validIdNumber:       { x: 195, top: 390, size: 9 },
  // membership type column is pre-printed (REGULAR or ASSOCIATE) — skip
  // employment category checkboxes — see drawCheckmark()

  statusOfEmployment:  { x: 50,  top: 430, size: 9, maxWidth: 130 },
  profession:          { x: 195, top: 430, size: 9, maxWidth: 130 },
  emergencyName:       { x: 340, top: 430, size: 9, maxWidth: 110 },
  emergencyContactRel: { x: 460, top: 430, size: 9, maxWidth: 100 },

  // Family
  spouseName:          { x: 50,  top: 520, size: 9, maxWidth: 220 },
  spouseDob:           { x: 285, top: 520, size: 9 },
  spouseContact:       { x: 395, top: 520, size: 9 },

  parentName:          { x: 50,  top: 555, size: 9, maxWidth: 220 },
  parentDob:           { x: 285, top: 555, size: 9 },
  parentContact:       { x: 395, top: 555, size: 9 },

  // Beneficiaries — 3 rows
  ben1Name:            { x: 50,  top: 605, size: 9, maxWidth: 200 },
  ben1Dob:             { x: 265, top: 605, size: 9 },
  ben1Rel:             { x: 365, top: 605, size: 9, maxWidth: 130 },
  ben1Age:             { x: 510, top: 605, size: 9 },

  ben2Name:            { x: 50,  top: 630, size: 9, maxWidth: 200 },
  ben2Dob:             { x: 265, top: 630, size: 9 },
  ben2Rel:             { x: 365, top: 630, size: 9, maxWidth: 130 },
  ben2Age:             { x: 510, top: 630, size: 9 },

  ben3Name:            { x: 50,  top: 655, size: 9, maxWidth: 200 },
  ben3Dob:             { x: 265, top: 655, size: 9 },
  ben3Rel:             { x: 365, top: 655, size: 9, maxWidth: 130 },
  ben3Age:             { x: 510, top: 655, size: 9 },

  // Signature row
  dateAccomplished:    { x: 105, top: 710, size: 9 },
  printedNameLine:     { x: 380, top: 720, size: 9, maxWidth: 180 },
};

// Regular variant additions: ISATU campus row + employment-category area.
const REGULAR_ONLY: Record<string, Coord> = {
  // campus checkmarks drawn next to labels at top ~470 (see drawCheckmark)
};

// Associate variant additions: qualification block at top of page.
const ASSOCIATE_ONLY: Record<string, Coord> = {
  associateOrgSpecify:    { x: 80,  top: 195, size: 9, maxWidth: 130 },
  recommenderName:        { x: 55,  top: 235, size: 9, maxWidth: 175 },
  recommenderRelationship:{ x: 250, top: 235, size: 9, maxWidth: 130 },
  recommenderCampus:      { x: 410, top: 235, size: 9, maxWidth: 150 },
};

function drawText(
  page: ReturnType<PDFDocumentType['getPage']>,
  font: PDFFont,
  text: string | undefined,
  coord: Coord,
) {
  if (!text || !text.trim()) return;
  const size = coord.size ?? 10;
  let str = text.trim();
  // Crude truncation if maxWidth set — pdf-lib has font.widthOfTextAtSize
  if (coord.maxWidth) {
    while (str.length > 0 && font.widthOfTextAtSize(str, size) > coord.maxWidth) {
      str = str.slice(0, -1);
    }
  }
  page.drawText(str, { x: coord.x, y: PAGE_HEIGHT - coord.top, size, font });
}

// Employment category checkbox approximate positions (next to the printed labels).
// All on the same row at top ~390.
const EMPLOYMENT_CHECKBOXES: Record<string, { x: number; top: number }> = {
  Employed:       { x: 348, top: 388 },
  'Self-Employed':{ x: 412, top: 388 },
  Retired:        { x: 491, top: 388 },
  Unemployed:     { x: 348, top: 400 },
  Others:         { x: 412, top: 400 },
};

// Campus checkboxes (regular only). Approximate positions.
const CAMPUS_CHECKBOXES: Record<string, { x: number; top: number }> = {
  'Main La Paz':  { x: 195, top: 470 },
  'Dumangas':     { x: 280, top: 470 },
  'Barotac Nuevo':{ x: 355, top: 470 },
  'Leon':         { x: 450, top: 470 },
  'Miag-ao':      { x: 495, top: 470 },
};

// Associate qualification radio positions.
const ASSOCIATE_QUAL_BOXES: Record<string, { x: number; top: number }> = {
  relationship:   { x: 50,  top: 185 },
  integrity:      { x: 220, top: 185 },
  organization:   { x: 395, top: 185 },
};

function drawCheckmark(
  page: ReturnType<PDFDocumentType['getPage']>,
  font: PDFFont,
  coord: { x: number; top: number },
) {
  // Use an X for visibility — checkmark glyph isn't in StandardFonts.
  page.drawText('X', { x: coord.x, y: PAGE_HEIGHT - coord.top, size: 10, font });
}

export async function fillApplicationPdf(
  variant: 'Regular' | 'Associate',
  data: PdfFieldData,
): Promise<Uint8Array> {
  // Lazy-import pdf-lib so it doesn't bloat the initial page bundle.
  const { PDFDocument, StandardFonts } = await import('pdf-lib');

  const url = `/forms/${variant}_Application_Form.pdf`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load template PDF (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());

  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(0);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const coords: Record<string, Coord> = {
    ...SHARED,
    ...(variant === 'Regular' ? REGULAR_ONLY : ASSOCIATE_ONLY),
  };

  // Identity block
  drawText(page, font, data.firstName, coords.firstName);
  drawText(page, font, data.middleName, coords.middleName);
  drawText(page, font, data.lastName, coords.lastName);
  drawText(page, font, data.extension, coords.extension);
  drawText(page, font, data.dob, coords.dob);
  drawText(page, font, data.placeOfBirth, coords.placeOfBirth);
  drawText(page, font, data.email, coords.email);
  drawText(page, font, data.contactNumber, coords.contactNumber);
  drawText(page, font, data.gender, coords.gender);
  drawText(page, font, data.civilStatus, coords.civilStatus);
  drawText(page, font, data.presentHomeAddress, coords.presentHomeAddress);
  drawText(page, font, data.homeAddress, coords.homeAddress);
  drawText(page, font, data.tinNumber, coords.tinNumber);
  drawText(page, font, data.validIdNumber, coords.validIdNumber);

  // Employment
  if (data.employmentCategory && EMPLOYMENT_CHECKBOXES[data.employmentCategory]) {
    drawCheckmark(page, font, EMPLOYMENT_CHECKBOXES[data.employmentCategory]);
  }
  drawText(page, font, data.statusOfEmployment, coords.statusOfEmployment);
  drawText(page, font, data.profession, coords.profession);
  drawText(page, font, data.emergencyName, coords.emergencyName);
  drawText(page, font, [data.emergencyContact, data.emergencyRelationship].filter(Boolean).join(' / '), coords.emergencyContactRel);

  // Variant-specific blocks
  if (variant === 'Regular') {
    if (data.isatuEmployee && data.campus && CAMPUS_CHECKBOXES[data.campus]) {
      drawCheckmark(page, font, CAMPUS_CHECKBOXES[data.campus]);
    }
  } else {
    if (data.associateQualification && ASSOCIATE_QUAL_BOXES[data.associateQualification]) {
      drawCheckmark(page, font, ASSOCIATE_QUAL_BOXES[data.associateQualification]);
    }
    drawText(page, font, data.associateOrgSpecify, ASSOCIATE_ONLY.associateOrgSpecify);
    drawText(page, font, data.recommenderName, ASSOCIATE_ONLY.recommenderName);
    drawText(page, font, data.recommenderRelationship, ASSOCIATE_ONLY.recommenderRelationship);
    drawText(page, font, data.recommenderCampus, ASSOCIATE_ONLY.recommenderCampus);
  }

  // Family
  drawText(page, font, data.spouseName, coords.spouseName);
  drawText(page, font, data.spouseDob, coords.spouseDob);
  drawText(page, font, data.spouseContact, coords.spouseContact);
  drawText(page, font, data.parentName, coords.parentName);
  drawText(page, font, data.parentDob, coords.parentDob);
  drawText(page, font, data.parentContact, coords.parentContact);

  // Beneficiaries
  const bens = data.beneficiaries ?? [];
  for (let i = 0; i < Math.min(3, bens.length); i++) {
    const b = bens[i];
    const idx = i + 1;
    drawText(page, font, b.name,         coords[`ben${idx}Name`]);
    drawText(page, font, b.dob,          coords[`ben${idx}Dob`]);
    drawText(page, font, b.relationship, coords[`ben${idx}Rel`]);
    drawText(page, font, b.age,          coords[`ben${idx}Age`]);
  }

  // Date + printed name (signature line)
  drawText(page, font, data.dateAccomplished, coords.dateAccomplished);
  const printedFull = [data.firstName, data.middleName, data.lastName, data.extension].filter(Boolean).join(' ');
  drawText(page, font, printedFull, coords.printedNameLine);

  // Watermark banner so it's obvious this is auto-generated.
  page.drawText('Auto-filled from website intake — verify all fields and sign before submitting', {
    x: 40,
    y: 18,
    size: 7,
    font,
  });

  return await pdf.save();
}

export function triggerPdfDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
