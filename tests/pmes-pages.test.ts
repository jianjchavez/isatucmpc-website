import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { ORG_NAME_LINE_1, ORG_NAME_LINE_2, PMES_CHAIR_CAPTION } from '~/lib/letterhead';
import bank from '~/data/pmes-questions.json';

const CERT = 'dist/pmes/certificate/index.html';
const VERIFY = 'dist/pmes/verify/index.html';
const built = existsSync(CERT) && existsSync(VERIFY);
if (!built) console.warn(`Skipping PMES page tests: ${CERT} absent. Run ./node_modules/.bin/astro build first.`);

describe('timed quiz page contract', () => {
  const page = readFileSync('src/pages/pmes/index.astro', 'utf8');
  const admin = readFileSync('src/pages/pmes/admin/index.astro', 'utf8');
  it('keeps application identity fields optional and explains the APP number', () => {
    expect(page).toContain('The APP- number printed on your application form.');
    expect(page).toMatch(/nameFields\.classList\.toggle\('hidden', isApplication\)/);
    expect(page).toMatch(/nameInput\.required = !isApplication/);
    expect(page).toMatch(/emailInput\.required = !isApplication/);
  });
  it('hidden result buttons stay hidden despite the global .pq-btn display rule', () => {
    expect(page).toMatch(/\.pq-btn\.hidden\s*\{\s*display:\s*none;?\s*\}/);
  });
  it('a /start that comes back as a result shows the result and stores no attempt id', () => {
    expect(page).toMatch(/if \(isStep\(response\)\) sessionStorage\.setItem\(STORE, response\.attemptId\);\s*showResponse\(response\);/);
  });
  it('presents one question with a single Next or Finish action', () => {
    expect(page).not.toContain('id="pq-back"');
    expect(page).not.toContain('id="pq-confirm"');
    expect(page).toContain('id="pq-next"');
    expect(page).toContain('Questions you missed');
    expect(page).toContain('20 questions, 30 seconds each, pass mark 16.');
  });
  it('uses a fixed per-question timer in the presenter view', () => {
    expect(admin).not.toContain('name="timer"');
    expect(admin).toContain('30 s per question');
  });
});

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
  it('no client bundle carries the question bank or its answer key', () => {
    const js = readdirSync('dist/_astro').filter(f => f.endsWith('.js'));
    expect(js.length).toBeGreaterThan(0);
    for (const f of js) {
      const src = readFileSync(`dist/_astro/${f}`, 'utf8');
      expect(src, f).not.toContain('"answer"');
      expect(src, f).not.toMatch(/\banswer:[0-3]\b/); // minified object keys lose their quotes
      expect(src, f).not.toContain(bank.questions[0]!.text);
    }
  });
});
