// Monthly salary deduction for an ISAT U regular applicant (Authority to Deduct page).
// Same rule as src/lib/subscription.ts; the form shows it first, this copy fills the PDF.
export const PAR_VALUE = 50;
export const PAID_WITH_APPLICATION = 50; // shares paid at the office visit (owner ruling 2026-11-17)
export const WELFARE_MONTHLY = 200; // Expanded Welfare Fund Policy, ages 18-55

export type Deduction = { months: number; capital: number; welfare: number; total: number };

/** Age in whole years on `today` (YYYY-MM-DD strings). */
export function ageOn(dateOfBirth: string, today: string): number {
  return Number(today.slice(0, 4)) - Number(dateOfBirth.slice(0, 4)) - (today.slice(5) < dateOfBirth.slice(5) ? 1 : 0);
}

export function monthlyDeduction(shares: number, years: number, age: number): Deduction {
  const months = years * 12;
  const capital = Math.round(((shares - PAID_WITH_APPLICATION) * PAR_VALUE / months) * 100) / 100;
  const welfare = age >= 18 && age <= 55 ? WELFARE_MONTHLY : 0;
  return { months, capital, welfare, total: Math.round((capital + welfare) * 100) / 100 };
}
