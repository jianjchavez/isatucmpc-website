import { describe, it, expect } from 'vitest';
import { COLORS, FONTS, BRAND_GRADIENT } from '~/lib/brand';

describe('brand tokens', () => {
  it('exports the six brand colors with correct hex values', () => {
    expect(COLORS.navy).toBe('#010066');
    expect(COLORS.orange).toBe('#FE9900');
    expect(COLORS.gold).toBe('#FFC001');
    expect(COLORS.red).toBe('#FF3F00');
    expect(COLORS.blue).toBe('#0102FD');
    expect(COLORS.green).toBe('#23CD63');
  });
  it('exports neutrals', () => {
    expect(COLORS.ink).toBe('#111827');
    expect(COLORS.slate).toBe('#6B7280');
    expect(COLORS.rule).toBe('#E8E8E8');
    expect(COLORS.background).toBe('#F5F5F5');
  });
  it('exports the navy → orange → gold gradient', () => {
    expect(BRAND_GRADIENT).toContain('#010066');
    expect(BRAND_GRADIENT).toContain('#FE9900');
    expect(BRAND_GRADIENT).toContain('#FFC001');
  });
  it('exports the two font families', () => {
    expect(FONTS.display).toMatch(/Montserrat/);
    expect(FONTS.body).toMatch(/Open Sans/);
  });
});
