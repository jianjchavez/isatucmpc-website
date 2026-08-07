import { describe, expect, it } from 'vitest';
import { calculateLoan, clampLoanInputs } from '~/lib/loanMath';

describe('calculateLoan', () => {
  it('calculates a straight-interest loan with flat principal and interest', () => {
    const result = calculateLoan({
      amount: 100_000,
      termMonths: 12,
      annualRatePercent: 12,
      method: 'straight',
    });

    expect(result.monthlyPayment).toBeCloseTo(9_333.333333, 5);
    expect(result.totalInterest).toBeCloseTo(12_000, 8);
    expect(result.totalPayable).toBeCloseTo(112_000, 8);
    expect(result.schedule).toHaveLength(12);
    expect(result.schedule[0]).toMatchObject({ month: 1 });
    expect(result.schedule[0].principal).toBeCloseTo(8_333.333333, 5);
    expect(result.schedule[0].interest).toBeCloseTo(1_000, 8);
    expect(result.schedule[11].balance).toBe(0);
  });

  it('calculates a diminishing-balance loan using MemberFolio annuity math', () => {
    const result = calculateLoan({
      amount: 100_000,
      termMonths: 12,
      annualRatePercent: 12,
      method: 'diminishing-balance',
    });

    expect(result.monthlyPayment).toBeCloseTo(8_884.878868, 5);
    expect(result.totalInterest).toBeCloseTo(6_618.54641, 5);
    expect(result.totalPayable).toBeCloseTo(106_618.54641, 5);
    expect(result.schedule[0].interest).toBeCloseTo(1_000, 8);
    expect(result.schedule[0].principal).toBeCloseTo(7_884.878868, 5);
    expect(result.schedule[11].balance).toBe(0);
  });

  it('caps the amortization schedule at the maximum supported term', () => {
    const result = calculateLoan({
      amount: 10_000_000,
      termMonths: 999,
      annualRatePercent: 60,
      method: 'straight',
    });

    expect(result.inputs.termMonths).toBe(360);
    expect(result.schedule).toHaveLength(360);
  });
});

describe('clampLoanInputs', () => {
  it('clamps amount, term, and annual rate to the public calculator bounds', () => {
    expect(
      clampLoanInputs({
        amount: -1,
        termMonths: 999,
        annualRatePercent: 0,
        method: 'straight',
      }),
    ).toEqual({
      amount: 1_000,
      termMonths: 360,
      annualRatePercent: 0.1,
      method: 'straight',
    });
  });

  it('normalizes a fractional term to a whole month', () => {
    expect(
      clampLoanInputs({
        amount: 100_000,
        termMonths: 12.8,
        annualRatePercent: 12,
        method: 'diminishing-balance',
      }).termMonths,
    ).toBe(13);
  });
});
