import { describe, it, expect } from 'vitest';
import { TIMELINE } from '~/data/timeline';

describe('TIMELINE', () => {
  it('has milestones in chronological order starting at 1964', () => {
    expect(TIMELINE[0].year).toBe(1964);
    for (let i = 1; i < TIMELINE.length; i++) {
      expect(TIMELINE[i].year).toBeGreaterThanOrEqual(TIMELINE[i - 1].year);
    }
  });
  it('mentions the WVCST → ISATUCMPC rename', () => {
    const renameEntry = TIMELINE.find(e => /ISATUCMPC|rename/i.test(e.body));
    expect(renameEntry).toBeDefined();
  });
  it('includes the CDA registration milestone', () => {
    expect(TIMELINE.some(e => e.body.includes('9520-06008210'))).toBe(true);
  });
});
