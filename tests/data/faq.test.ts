import { describe, it, expect } from 'vitest';
import { FAQ } from '~/data/faq';
describe('FAQ', () => {
  it('has at least 6 entries', () => { expect(FAQ.length).toBeGreaterThanOrEqual(6); });
  it('every entry has a non-empty question and answer', () => {
    for (const f of FAQ) {
      expect(f.q.length).toBeGreaterThan(5);
      expect(f.a.length).toBeGreaterThan(10);
    }
  });
});
