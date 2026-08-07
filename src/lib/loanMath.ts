/**
 * Public, illustrative loan calculations.
 *
 * Ported from MemberFolio's `shared/loanCalculations.ts`, which remains the
 * source of truth for ISATUCMPC amortization behavior. Product-specific fees,
 * insurance, advance interest, and yearly-diminishing calculations are
 * intentionally excluded from this public calculator.
 */

export const LOAN_LIMITS = {
  amount: { min: 1_000, max: 10_000_000 },
  termMonths: { min: 1, max: 360 },
  annualRatePercent: { min: 0.1, max: 60 },
} as const;

export type LoanMethod = 'straight' | 'diminishing-balance';

export interface LoanInputs {
  amount: number;
  termMonths: number;
  annualRatePercent: number;
  method: LoanMethod;
}

export interface AmortizationRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface LoanResult {
  inputs: LoanInputs;
  monthlyPayment: number;
  firstPayment: number;
  lastPayment: number;
  averagePayment: number;
  totalInterest: number;
  totalPayable: number;
  schedule: AmortizationRow[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function clampLoanInputs(inputs: LoanInputs): LoanInputs {
  return {
    amount: clamp(inputs.amount, LOAN_LIMITS.amount.min, LOAN_LIMITS.amount.max),
    termMonths: clamp(
      Math.round(inputs.termMonths),
      LOAN_LIMITS.termMonths.min,
      LOAN_LIMITS.termMonths.max,
    ),
    annualRatePercent: clamp(
      inputs.annualRatePercent,
      LOAN_LIMITS.annualRatePercent.min,
      LOAN_LIMITS.annualRatePercent.max,
    ),
    method: inputs.method,
  };
}

export function calculateLoan(rawInputs: LoanInputs): LoanResult {
  const inputs = clampLoanInputs(rawInputs);
  const { amount, termMonths, annualRatePercent, method } = inputs;
  const monthlyRate = annualRatePercent / 100 / 12;
  const schedule: AmortizationRow[] = [];

  let monthlyPayment: number;
  if (method === 'straight') {
    const totalInterest = amount * monthlyRate * termMonths;
    monthlyPayment = (amount + totalInterest) / termMonths;
  } else {
    const factor = Math.pow(1 + monthlyRate, termMonths);
    monthlyPayment = amount * ((monthlyRate * factor) / (factor - 1));
  }

  let balance = amount;
  let totalInterest = 0;
  let totalPayable = 0;
  const straightInterest = amount * monthlyRate;
  const straightPrincipal = amount / termMonths;

  // `termMonths` is clamped above, so this synchronous loop is capped at 360 rows.
  for (let month = 1; month <= termMonths; month += 1) {
    const interest = method === 'straight' ? straightInterest : balance * monthlyRate;
    let principal = method === 'straight' ? straightPrincipal : monthlyPayment - interest;

    if (month === termMonths) principal = balance;
    const payment = principal + interest;
    balance -= principal;
    totalInterest += interest;
    totalPayable += payment;

    schedule.push({
      month,
      payment,
      principal,
      interest,
      balance: month === termMonths ? 0 : Math.max(0, balance),
    });
  }

  return {
    inputs,
    monthlyPayment,
    firstPayment: schedule[0].payment,
    lastPayment: schedule[schedule.length - 1].payment,
    averagePayment: totalPayable / termMonths,
    totalInterest,
    totalPayable,
    schedule,
  };
}
