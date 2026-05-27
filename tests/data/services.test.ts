import { describe, it, expect } from 'vitest';
import { SERVICES } from '~/data/services';

describe('SERVICES data', () => {
  it('has all 8 operating services in operating order', () => {
    expect(SERVICES).toHaveLength(8);
    expect(SERVICES.map(s => s.slug)).toEqual([
      'credit', 'savings', 'convenience-store', 'laundry',
      'boarding-house', 'copy-center', 'food-park', 'ucafe',
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
});
