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

// NOTE: the two application PDFs are NOT the same template. The Associate form
// adds a "Qualification" block at the top that pushes Personal Data down ~62pt
// and uses checkboxes (not write-ins) for gender/civil status. Each variant
// therefore has its own fully-calibrated coordinate map below.
//
// All `top` values calibrated 2026-05-29 from each template's real label
// coordinates (extracted via `pdftotext -bbox`). Both forms share 3 layouts:
//   - Personal Data: label sits above its cell, value goes ~19pt below the label
//   - Family info:   label sits inline, value goes to the RIGHT on the same line
//   - Beneficiaries: table; values sit in rows under the column headers
const REGULAR_COORDS: Record<string, Coord> = {
  // Names row — labels at top≈183
  firstName:           { x: 42,  top: 202, size: 9, maxWidth: 140 },
  middleName:          { x: 189, top: 202, size: 9, maxWidth: 125 },
  lastName:            { x: 321, top: 202, size: 9, maxWidth: 118 },
  extension:           { x: 445, top: 202, size: 9, maxWidth: 110 },

  // DOB / Place / Email / Contact / Gender / Civil — labels at top≈213
  dob:                 { x: 42,  top: 232, size: 8, maxWidth: 68 },
  placeOfBirth:        { x: 116, top: 232, size: 8, maxWidth: 68 },
  email:               { x: 189, top: 232, size: 8, maxWidth: 125 },
  contactNumber:       { x: 321, top: 232, size: 8, maxWidth: 118 },
  // Gender / Civil Status are write-in fields (no checkboxes on the form)
  gender:              { x: 445, top: 232, size: 8, maxWidth: 48 },
  civilStatus:         { x: 496, top: 232, size: 8, maxWidth: 62 },

  // Addresses — labels at top≈240
  presentHomeAddress:  { x: 42,  top: 259, size: 8, maxWidth: 262 },
  homeAddress:         { x: 321, top: 259, size: 8, maxWidth: 232 },

  // TIN / Valid ID — labels at top≈266
  tinNumber:           { x: 42,  top: 286, size: 9, maxWidth: 140 },
  validIdNumber:       { x: 189, top: 286, size: 9, maxWidth: 125 },
  // membership type column is pre-printed (REGULAR or ASSOCIATE) — skip
  // employment category checkboxes — see drawCheckmark()

  // Status / Profession / Emergency — labels at top≈296 (left two wrap to 303)
  statusOfEmployment:  { x: 42,  top: 318, size: 8, maxWidth: 140 },
  profession:          { x: 189, top: 318, size: 8, maxWidth: 125 },
  emergencyName:       { x: 321, top: 318, size: 8, maxWidth: 118 },
  emergencyContactRel: { x: 445, top: 318, size: 8, maxWidth: 112 },

  // Family — inline labels; value to the RIGHT on the same baseline
  spouseName:          { x: 92,  top: 368, size: 8, maxWidth: 150 },
  spouseDob:           { x: 300, top: 368, size: 8, maxWidth: 78 },
  spouseContact:       { x: 423, top: 368, size: 8, maxWidth: 90 },

  parentName:          { x: 115, top: 390, size: 8, maxWidth: 128 },
  parentDob:           { x: 300, top: 390, size: 8, maxWidth: 78 },
  parentContact:       { x: 423, top: 390, size: 8, maxWidth: 90 },

  // Beneficiaries — column headers at top≈421; 3 data rows below (~13pt pitch)
  ben1Name:            { x: 40,  top: 437, size: 8, maxWidth: 210 },
  ben1Dob:             { x: 262, top: 437, size: 8, maxWidth: 120 },
  ben1Rel:             { x: 393, top: 437, size: 8, maxWidth: 110 },
  ben1Age:             { x: 512, top: 437, size: 8 },

  ben2Name:            { x: 40,  top: 450, size: 8, maxWidth: 210 },
  ben2Dob:             { x: 262, top: 450, size: 8, maxWidth: 120 },
  ben2Rel:             { x: 393, top: 450, size: 8, maxWidth: 110 },
  ben2Age:             { x: 512, top: 450, size: 8 },

  ben3Name:            { x: 40,  top: 463, size: 8, maxWidth: 210 },
  ben3Dob:             { x: 262, top: 463, size: 8, maxWidth: 120 },
  ben3Rel:             { x: 393, top: 463, size: 8, maxWidth: 110 },
  ben3Age:             { x: 512, top: 463, size: 8 },

  // Signature line — caption "DATE ACCOMPLISHED / APPLICANT'S SIGNATURE" at top≈501
  dateAccomplished:    { x: 100, top: 508, size: 9 },
  printedNameLine:     { x: 415, top: 496, size: 9, maxWidth: 150 },
};

// Associate form: full map. Personal Data sits ~62pt lower than Regular because
// of the Qualification block (top≈165-210). Gender/Civil are checkboxes here,
// not write-ins (see ASSOCIATE_GENDER_BOXES / ASSOCIATE_CIVIL_BOXES).
const ASSOCIATE_COORDS: Record<string, Coord> = {
  // Qualification block — write-in beside the "(PLEASE SPECIFY):" label (top≈188)
  associateOrgSpecify:    { x: 98,  top: 195, size: 8, maxWidth: 250 },
  // Recommender block — labels at top≈203; values on the line below
  recommenderName:        { x: 42,  top: 221, size: 8, maxWidth: 165 },
  recommenderRelationship:{ x: 178, top: 221, size: 8, maxWidth: 110 },
  recommenderCampus:      { x: 445, top: 221, size: 8, maxWidth: 112 },

  // Names row — labels at top≈245
  firstName:           { x: 42,  top: 264, size: 9, maxWidth: 140 },
  middleName:          { x: 189, top: 264, size: 9, maxWidth: 125 },
  lastName:            { x: 321, top: 264, size: 9, maxWidth: 118 },
  extension:           { x: 445, top: 264, size: 9, maxWidth: 110 },

  // DOB / Place / Email / Contact — labels at top≈275 (gender/civil are checkboxes)
  dob:                 { x: 42,  top: 294, size: 8, maxWidth: 68 },
  placeOfBirth:        { x: 116, top: 294, size: 8, maxWidth: 68 },
  email:               { x: 189, top: 294, size: 8, maxWidth: 125 },
  contactNumber:       { x: 321, top: 294, size: 8, maxWidth: 118 },

  // Addresses — labels at top≈301.8
  presentHomeAddress:  { x: 42,  top: 321, size: 8, maxWidth: 262 },
  homeAddress:         { x: 321, top: 321, size: 8, maxWidth: 232 },

  // TIN / Valid ID — labels at top≈328.4
  tinNumber:           { x: 42,  top: 348, size: 9, maxWidth: 140 },
  validIdNumber:       { x: 189, top: 348, size: 9, maxWidth: 125 },

  // Status / Profession / Emergency — labels at top≈358.2 (left two wrap to 365)
  statusOfEmployment:  { x: 42,  top: 380, size: 8, maxWidth: 140 },
  profession:          { x: 189, top: 380, size: 8, maxWidth: 125 },
  emergencyName:       { x: 321, top: 380, size: 8, maxWidth: 118 },
  emergencyContactRel: { x: 445, top: 380, size: 8, maxWidth: 112 },

  // Family — inline labels at top≈403.3 / 425.2; value to the RIGHT
  spouseName:          { x: 92,  top: 411, size: 8, maxWidth: 150 },
  spouseDob:           { x: 300, top: 411, size: 8, maxWidth: 78 },
  spouseContact:       { x: 423, top: 411, size: 8, maxWidth: 90 },

  parentName:          { x: 115, top: 433, size: 8, maxWidth: 128 },
  parentDob:           { x: 300, top: 433, size: 8, maxWidth: 78 },
  parentContact:       { x: 423, top: 433, size: 8, maxWidth: 90 },

  // Beneficiaries — column headers at top≈463.2; 3 data rows below (~13pt pitch)
  ben1Name:            { x: 40,  top: 479, size: 8, maxWidth: 210 },
  ben1Dob:             { x: 262, top: 479, size: 8, maxWidth: 120 },
  ben1Rel:             { x: 393, top: 479, size: 8, maxWidth: 110 },
  ben1Age:             { x: 512, top: 479, size: 8 },

  ben2Name:            { x: 40,  top: 492, size: 8, maxWidth: 210 },
  ben2Dob:             { x: 262, top: 492, size: 8, maxWidth: 120 },
  ben2Rel:             { x: 393, top: 492, size: 8, maxWidth: 110 },
  ben2Age:             { x: 512, top: 492, size: 8 },

  ben3Name:            { x: 40,  top: 505, size: 8, maxWidth: 210 },
  ben3Dob:             { x: 262, top: 505, size: 8, maxWidth: 120 },
  ben3Rel:             { x: 393, top: 505, size: 8, maxWidth: 110 },
  ben3Age:             { x: 512, top: 505, size: 8 },

  // Signature line — "DATE ACCOMPLISHED" at top≈533.3; signature caption at top≈547.7
  dateAccomplished:    { x: 100, top: 540, size: 9 },
  printedNameLine:     { x: 408, top: 543, size: 9, maxWidth: 150 },
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

// Employment category checkbox positions, per variant (the ☐ glyphs sit on a
// 2-row grid). Regular: row1 top≈275 / row2 top≈284. Associate: shifted down
// with the rest of Personal Data — row1 top≈337 / row2 top≈346.
const EMPLOYMENT_CHECKBOXES_REGULAR: Record<string, { x: number; top: number }> = {
  Employed:       { x: 444, top: 282 },
  'Self-Employed':{ x: 483, top: 282 },
  Retired:        { x: 527, top: 282 },
  Unemployed:     { x: 444, top: 291 },
  Others:         { x: 484, top: 291 },
};
const EMPLOYMENT_CHECKBOXES_ASSOCIATE: Record<string, { x: number; top: number }> = {
  Employed:       { x: 444, top: 343 },
  'Self-Employed':{ x: 483, top: 343 },
  Retired:        { x: 527, top: 343 },
  Unemployed:     { x: 444, top: 352 },
  Others:         { x: 484, top: 352 },
};

// Campus checkboxes (Regular only). The ☐ glyphs sit at top≈329.
const CAMPUS_CHECKBOXES: Record<string, { x: number; top: number }> = {
  'Main La Paz':  { x: 162, top: 336 },
  'Dumangas':     { x: 222, top: 336 },
  'Barotac Nuevo':{ x: 277, top: 336 },
  'Leon':         { x: 344, top: 336 },
  'Miag-ao':      { x: 376, top: 336 },
};

// Associate qualification shade-boxes — sit just left of each option label
// (labels at top≈181: relationship@52, integrity@217, organization@375).
const ASSOCIATE_QUAL_BOXES: Record<string, { x: number; top: number }> = {
  relationship:   { x: 41,  top: 188 },
  integrity:      { x: 206, top: 188 },
  organization:   { x: 363, top: 188 },
};

// Associate gender/civil-status checkboxes (☐ glyphs extracted at top≈283.5,
// with SEPARATED on the second sub-row at top≈289.8).
const ASSOCIATE_GENDER_BOXES: Record<string, { x: number; top: number }> = {
  Male:   { x: 444, top: 290 },
  Female: { x: 464, top: 290 },
};
const ASSOCIATE_CIVIL_BOXES: Record<string, { x: number; top: number }> = {
  Single:    { x: 496, top: 290 },
  Married:   { x: 523, top: 290 },
  Separated: { x: 504, top: 296 },
};

function drawCheckmark(
  page: ReturnType<PDFDocumentType['getPage']>,
  font: PDFFont,
  coord: { x: number; top: number },
) {
  // Use an X for visibility — checkmark glyph isn't in StandardFonts.
  // Size 8 fits inside the small ☐ boxes on the form.
  page.drawText('X', { x: coord.x, y: PAGE_HEIGHT - coord.top, size: 8, font });
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

  const isRegular = variant === 'Regular';
  const coords: Record<string, Coord> = isRegular ? REGULAR_COORDS : ASSOCIATE_COORDS;
  const employmentBoxes = isRegular
    ? EMPLOYMENT_CHECKBOXES_REGULAR
    : EMPLOYMENT_CHECKBOXES_ASSOCIATE;

  // Identity block
  drawText(page, font, data.firstName, coords.firstName);
  drawText(page, font, data.middleName, coords.middleName);
  drawText(page, font, data.lastName, coords.lastName);
  drawText(page, font, data.extension, coords.extension);
  drawText(page, font, data.dob, coords.dob);
  drawText(page, font, data.placeOfBirth, coords.placeOfBirth);
  drawText(page, font, data.email, coords.email);
  drawText(page, font, data.contactNumber, coords.contactNumber);

  // Gender / Civil Status: Regular form has write-in blanks; Associate has checkboxes.
  if (isRegular) {
    drawText(page, font, data.gender, coords.gender);
    drawText(page, font, data.civilStatus, coords.civilStatus);
  } else {
    if (data.gender && ASSOCIATE_GENDER_BOXES[data.gender]) {
      drawCheckmark(page, font, ASSOCIATE_GENDER_BOXES[data.gender]);
    }
    if (data.civilStatus && ASSOCIATE_CIVIL_BOXES[data.civilStatus]) {
      drawCheckmark(page, font, ASSOCIATE_CIVIL_BOXES[data.civilStatus]);
    }
  }

  drawText(page, font, data.presentHomeAddress, coords.presentHomeAddress);
  drawText(page, font, data.homeAddress, coords.homeAddress);
  drawText(page, font, data.tinNumber, coords.tinNumber);
  drawText(page, font, data.validIdNumber, coords.validIdNumber);

  // Employment
  if (data.employmentCategory && employmentBoxes[data.employmentCategory]) {
    drawCheckmark(page, font, employmentBoxes[data.employmentCategory]);
  }
  drawText(page, font, data.statusOfEmployment, coords.statusOfEmployment);
  drawText(page, font, data.profession, coords.profession);
  drawText(page, font, data.emergencyName, coords.emergencyName);
  drawText(page, font, [data.emergencyContact, data.emergencyRelationship].filter(Boolean).join(' / '), coords.emergencyContactRel);

  // Variant-specific blocks
  if (isRegular) {
    if (data.isatuEmployee && data.campus && CAMPUS_CHECKBOXES[data.campus]) {
      drawCheckmark(page, font, CAMPUS_CHECKBOXES[data.campus]);
    }
  } else {
    if (data.associateQualification && ASSOCIATE_QUAL_BOXES[data.associateQualification]) {
      drawCheckmark(page, font, ASSOCIATE_QUAL_BOXES[data.associateQualification]);
    }
    drawText(page, font, data.associateOrgSpecify, coords.associateOrgSpecify);
    drawText(page, font, data.recommenderName, coords.recommenderName);
    drawText(page, font, data.recommenderRelationship, coords.recommenderRelationship);
    drawText(page, font, data.recommenderCampus, coords.recommenderCampus);
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
