import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { ORG_NAME_LINE_1, ORG_NAME_LINE_2, PMES_CHAIR_CAPTION } from '~/lib/letterhead';

const CERT = 'dist/pmes/certificate/index.html';
const VERIFY = 'dist/pmes/verify/index.html';
const built = existsSync(CERT) && existsSync(VERIFY);
if (!built) console.warn(`Skipping PMES page tests: ${CERT} absent. Run ./node_modules/.bin/astro build first.`);

describe.skipIf(!built)('built PMES pages', () => {
  it('certificate carries the letterhead, A4 page size and the Vice-Chairperson caption', () => {
    const html = readFileSync(CERT, 'utf8');
    expect(html).toContain(ORG_NAME_LINE_1);
    expect(html).toContain(ORG_NAME_LINE_2);
    expect(html).toContain('size: A4');
    expect(html).toContain(PMES_CHAIR_CAPTION);
    expect(html).not.toMatch(/(^|[^-])Chairperson, Board of Directors/);
    expect(html).not.toMatch(/consumers|& multi|multi purpose/i);
  });
  it('verify page renders', () => {
    expect(readFileSync(VERIFY, 'utf8')).toContain('Verify a PMES certificate');
  });
});
