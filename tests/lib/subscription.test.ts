import { describe, it, expect } from 'vitest';
import { numberToWords, formatAmount, MIN_SHARES, PAR_VALUE } from '~/lib/subscription';

describe('share subscription', () => {
  it('minimum is 500 shares at PHP 50.00', () => {
    expect(MIN_SHARES).toBe(500);
    expect(PAR_VALUE).toBe(50);
    expect(formatAmount(MIN_SHARES * PAR_VALUE)).toBe('25,000.00');
  });
  it('writes numbers in words', () => {
    expect(numberToWords(5)).toBe('Five');
    expect(numberToWords(500)).toBe('Five Hundred');
    expect(numberToWords(25_000)).toBe('Twenty-Five Thousand');
    expect(numberToWords(123_450)).toBe('One Hundred Twenty-Three Thousand Four Hundred Fifty');
    expect(numberToWords(1_005_000)).toBe('One Million Five Thousand');
  });
});
