import { describe, it, expect } from 'vitest';
import * as LH from '~/lib/letterhead';
import { siteQrSvg } from '~/components/pmes-qr';

describe('PMES letterhead constants', () => {
  it('carries the two uppercase organization name lines verbatim', () => {
    expect(LH.ORG_NAME_LINE_1).toBe('ILOILO SCIENCE AND TECHNOLOGY UNIVERSITY AND');
    expect(LH.ORG_NAME_LINE_2).toBe('COMMUNITY MULTI-PURPOSE COOPERATIVE (ISATUCMPC)');
  });
  it('contains none of the banned name variants', () => {
    const all = Object.values(LH).join(' ');
    expect(all).not.toMatch(/consumers|& multi|multi purpose/i);
  });
  it('signature caption names the Vice-Chairperson, never the Board Chairperson', () => {
    expect(LH.PMES_CHAIR_CAPTION).toContain('Vice-Chairperson, Board of Directors');
    expect(LH.PMES_CHAIR_CAPTION).not.toMatch(/(^|[^-])Chairperson, Board of Directors/);
  });
});

describe('siteQrSvg', () => {
  it('renders navy vector squares sized in mm', () => {
    const svg = siteQrSvg(12);
    expect(svg).toContain('width="12mm"');
    expect(svg).toContain('fill="#010066"');
    expect(svg).toMatch(/<rect /);
    expect(svg).toContain('https://www.isatucmpc.coop');
  });
});
