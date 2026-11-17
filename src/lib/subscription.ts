// Share subscription rules for the Membership Subscription Agreement.
// The worker checks the same minimum (worker/src/membership/office-packet.ts).
export const PAR_VALUE = 50; // PHP per share, as printed on the application form
// Owner ruling 2026-11-17 (replaces 11-16's 25): subscribe at least 50 shares and pay at least
// 50 at the office with the membership fee; shares above 50 are paid over time.
export const MIN_SHARES = 50;
export const PAID_WITH_APPLICATION = 50;
export const MEMBERSHIP_FEE = 500;
export const WELFARE_MONTHLY = 200; // Expanded Welfare Fund Policy, ages 18-55

/** Age in whole years on `today` (YYYY-MM-DD strings). */
export function ageOn(dateOfBirth: string, today: string): number {
  return Number(today.slice(0, 4)) - Number(dateOfBirth.slice(0, 4)) - (today.slice(5) < dateOfBirth.slice(5) ? 1 : 0);
}

/** ISAT U salary deduction (Authority to Deduct). Same rule as worker/src/membership/deduction.ts. */
export function monthlyDeduction(shares: number, years: number, age: number) {
  const months = years * 12;
  const capital = Math.round(((shares - PAID_WITH_APPLICATION) * PAR_VALUE / months) * 100) / 100;
  const welfare = age >= 18 && age <= 55 ? WELFARE_MONTHLY : 0;
  return { months, capital, welfare, total: Math.round((capital + welfare) * 100) / 100 };
}

const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** Whole number in words, e.g. 25000 -> "Twenty-Five Thousand". */
export function numberToWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  const scale = (size: number, label: string) =>
    numberToWords(Math.floor(n / size)) + ` ${label}` + (n % size ? ' ' + numberToWords(n % size) : '');
  if (n < 1_000) return scale(100, 'Hundred');
  if (n < 1_000_000) return scale(1_000, 'Thousand');
  return scale(1_000_000, 'Million');
}

/** "25,000.00" */
export function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
