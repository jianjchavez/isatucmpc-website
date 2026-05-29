// Dev-only calibration harness: runs the REAL fillApplicationPdf against the
// on-disk template (stubbing browser fetch) so we can verify field positions
// without a browser. Run: ./node_modules/.bin/tsx scripts/pdf-calibration-check.mts
import { readFile, writeFile } from 'node:fs/promises';
import { fillApplicationPdf, type PdfFieldData } from '../src/lib/pdf-fill.ts';

// Stub the browser fetch used inside fillApplicationPdf -> read from public/.
(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (url: string) => {
  const rel = String(url).replace(/^\//, '');
  const buf = await readFile(`public/${rel}`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return { ok: true, status: 200, arrayBuffer: async () => ab } as Response;
}) as typeof fetch;

const data: PdfFieldData = {
  firstName: 'Joseph Ian', middleName: 'Jalandoni', lastName: 'Chavez',
  dob: '1980-03-20', placeOfBirth: 'Iloilo City',
  email: 'jianjchavez@gmail.com', contactNumber: '09085157275',
  gender: 'Male', civilStatus: 'Married',
  presentHomeAddress: 'Brgy. Rizal Pala-pala Zone 1, Dumangas',
  homeAddress: 'Brgy. Rizal Pala-pala Zone 1, Dumangas',
  tinNumber: '936-428-760', validIdNumber: 'f0315004389',
  employmentCategory: 'Self-Employed',
  statusOfEmployment: 'Regular', profession: 'Faculty',
  emergencyName: 'Lizette R. Chavez', emergencyContact: '09684864875', emergencyRelationship: 'Spouse',
  isatuEmployee: true, campus: 'Main La Paz',
  spouseName: 'Lizette R. Chavez', spouseDob: '1986-01-11', spouseContact: '09684864875',
  parentName: 'Helmina J. Chavez', parentDob: '1952-11-09', parentContact: '09111111111',
  beneficiaries: [
    { name: 'Lizette R. Chavez', dob: '1986-01-11', relationship: 'Spouse', age: '39' },
    { name: 'Julian Chase R. Chavez', dob: '2016-12-24', relationship: 'Son', age: '9' },
  ],
  dateAccomplished: '2026-05-28',
  // Associate-only block (ignored by the Regular fill)
  associateQualification: 'organization',
  associateOrgSpecify: 'ISATU Faculty Association',
  recommenderName: 'Maria S. Santos',
  recommenderRelationship: 'Colleague',
  recommenderCampus: 'Main La Paz',
};

for (const variant of ['Regular', 'Associate'] as const) {
  const bytes = await fillApplicationPdf(variant, data);
  const out = `/tmp/test_${variant.toLowerCase()}.pdf`;
  await writeFile(out, bytes);
  console.log(`WROTE ${out} (${bytes.length} bytes)`);
}
