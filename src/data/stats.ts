export interface Stat { value: string; label: string; }
// "Years serving" computes from the 1964 founding year so it auto-advances on each rebuild.
// Members count and total assets are operator-maintained; update here when figures change.
const FOUNDED = 1964;
export const STATS: Stat[] = [
  { value: `${new Date().getFullYear() - FOUNDED}+`, label: 'Years serving our community' },
  { value: 'Nearly 1,000', label: 'Members' },
  { value: '₱195M+', label: 'In total assets' },
];
