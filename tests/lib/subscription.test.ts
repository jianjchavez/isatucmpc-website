import { describe, it, expect } from 'vitest';
import { numberToWords, formatAmount, MIN_SHARES, PAR_VALUE, PAID_WITH_APPLICATION, ageOn, monthlyDeduction } from '~/lib/subscription';

describe('share subscription', () => {
  it('minimum is 50 shares at PHP 50.00, 25 of them paid with the application (owner ruling 2026-11-16)', () => {
    expect(MIN_SHARES).toBe(50);
    expect(PAR_VALUE).toBe(50);
    expect(PAID_WITH_APPLICATION).toBe(50);
    expect(formatAmount(MIN_SHARES * PAR_VALUE)).toBe('2,500.00');
  });
  it('salary deduction matches the Worker: unpaid shares over the months, PHP 200 welfare for ages 18-55', () => {
    expect(monthlyDeduction(50, 2, 40)).toEqual({ months: 24, capital: 0, welfare: 200, total: 200 });
    expect(monthlyDeduction(100, 2, 56)).toEqual({ months: 24, capital: 104.17, welfare: 0, total: 104.17 });
    expect(ageOn('1970-11-17', '2026-11-16')).toBe(55);
  });
  it('writes numbers in words', () => {
    expect(numberToWords(5)).toBe('Five');
    expect(numberToWords(500)).toBe('Five Hundred');
    expect(numberToWords(25_000)).toBe('Twenty-Five Thousand');
    expect(numberToWords(123_450)).toBe('One Hundred Twenty-Three Thousand Four Hundred Fifty');
    expect(numberToWords(1_005_000)).toBe('One Million Five Thousand');
  });
});
