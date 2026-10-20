import { describe, it, expect } from 'vitest';
import bank from '~/data/pmes-questions.json';

describe('PMES question bank', () => {
  const sectionIds = bank.sections.map(s => s.id);

  it('has unique question ids', () => {
    const ids = bank.questions.map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every question is well formed', () => {
    for (const q of bank.questions) {
      expect(sectionIds, q.id).toContain(q.section);
      expect(Number.isInteger(q.slide) && q.slide > 0, q.id).toBe(true);
      expect(q.text.length, q.id).toBeGreaterThan(10);
      expect(q.options, q.id).toHaveLength(4);
      expect(new Set(q.options).size, q.id).toBe(4);
      expect([0, 1, 2, 3], q.id).toContain(q.answer);
      expect(['draft', 'approved'], q.id).toContain(q.status);
    }
  });

  it('every section has at least 4 questions', () => {
    for (const id of sectionIds) {
      expect(bank.questions.filter(q => q.section === id).length, id).toBeGreaterThanOrEqual(4);
    }
  });
});
