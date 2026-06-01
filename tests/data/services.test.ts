import { describe, it, expect } from 'vitest';
import { SERVICES } from '~/data/services';

describe('SERVICES data', () => {
  it('has all 10 operating services in operating order', () => {
    expect(SERVICES).toHaveLength(10);
    expect(SERVICES.map(s => s.slug)).toEqual([
      'credit', 'sm-credit', 'in-store-credit', 'savings',
      'convenience-store', 'laundry', 'boarding-house',
      'copy-center', 'food-park', 'ucafe',
    ]);
  });
  it('every service has the required fields', () => {
    for (const s of SERVICES) {
      expect(s.slug).toMatch(/^[a-z-]+$/);
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(['active', 'coming-soon', 'by-appointment']).toContain(s.status);
    }
  });
  it('has unique slugs', () => {
    const slugs = SERVICES.map(s => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
