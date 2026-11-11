import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('website application privacy notice', () => {
  const notice = readFileSync('src/pages/privacy.astro', 'utf8');
  const record = readFileSync('src/lib/membership-record.ts', 'utf8');
  const packet = readFileSync('worker/src/membership/office-packet.ts', 'utf8');

  it('explains the secured MemberFolio hand-off and temporary website retention', () => {
    expect(notice).toContain('MemberFolio');
    expect(notice).toContain('secured connection');
    expect(notice).toContain('90 days');
    expect(notice).toContain('application number');
    expect(notice).toContain('mobile number');
    expect(notice).toContain('email address');
    expect(notice).not.toContain('This website itself keeps <strong>no database of submissions</strong>');
  });

  it('uses the November 2026 notice version for consent and printed packets', () => {
    expect(notice).toContain('v2026-11');
    expect(notice).not.toContain('Version 2026-11, adopted by Board Resolution');
    expect(notice).toContain('updates Version 2026-08');
    expect(record).toContain('Privacy Notice v2026-11');
    expect(packet).toContain("PRIVACY_NOTICE_VERSION = '2026-11'");
  });

  it('retains the RA 10173 rights wording', () => {
    expect(notice).toContain('Your rights under RA 10173');
    expect(notice).toContain('Data Privacy Act of 2012');
  });
});
