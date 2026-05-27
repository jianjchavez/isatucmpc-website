export interface Stat { value: string; label: string; }
// Members count + CDA Reg No. locked per spec §8 — updates require a spec amendment.
// "Years serving" computes from the 1964 founding year so it auto-advances on each rebuild.
const FOUNDED = 1964;
export const STATS: Stat[] = [
  { value: `${new Date().getFullYear() - FOUNDED}+`, label: 'Years serving Iloilo' },
  { value: 'Over 1,000', label: 'Members' },
  { value: '9520-06008210', label: 'CDA Reg. No.' },
];
