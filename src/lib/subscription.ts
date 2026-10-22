// Share subscription rules for the Membership Subscription Agreement.
// The worker checks the same minimum (worker/src/membership/office-packet.ts).
export const PAR_VALUE = 50; // PHP per share, as printed on the application form
export const MIN_SHARES = 500;

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
