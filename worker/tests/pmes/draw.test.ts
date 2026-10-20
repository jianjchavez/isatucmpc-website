import { describe, it, expect } from 'vitest';
import { loadBank } from '../../src/pmes/bank';
import { drawQuiz, presentDraw } from '../../src/pmes/draw';

const bank = loadBank('draft');
const isPermutation = (order: number[]) => [...order].sort().join() === '0,1,2,3';

describe('loadBank', () => {
  it('filters by status', () => {
    expect(bank.sections).toHaveLength(10);
    expect(bank.questions.length).toBeGreaterThanOrEqual(40);
    expect(loadBank('approved').questions).toHaveLength(0);
  });
});

describe('drawQuiz', () => {
  it('draws exactly 2 per section, 20 unique items, option permutations', () => {
    const draw = drawQuiz(bank);
    expect(draw.items).toHaveLength(20);
    expect(new Set(draw.items.map(i => i.id)).size).toBe(20);
    const byId = new Map(bank.questions.map(q => [q.id, q]));
    for (const s of bank.sections) {
      expect(draw.items.filter(i => byId.get(i.id)!.section === s.id)).toHaveLength(2);
    }
    for (const i of draw.items) expect(isPermutation(i.optionOrder)).toBe(true);
  });

  it('is reproducible with an injected random', () => {
    const seeded = () => {
      let s = 42;
      return (n: number) => { s = (s * 1103515245 + 12345) % 2147483648; return s % n; };
    };
    expect(drawQuiz(bank, 2, seeded())).toEqual(drawQuiz(bank, 2, seeded()));
  });

  it('throws when a section has too few questions of the status', () => {
    expect(() => drawQuiz(loadBank('approved'))).toThrow('bank-too-small:idea');
  });
});

describe('presentDraw', () => {
  it('numbers items, reorders options and never includes the answer', () => {
    const draw = drawQuiz(bank);
    const presented = presentDraw(bank, draw);
    expect(presented).toHaveLength(20);
    const byId = new Map(bank.questions.map(q => [q.id, q]));
    presented.forEach((p, i) => {
      const q = byId.get(p.id)!;
      expect(p.n).toBe(i + 1);
      expect(p.section).toBe(q.section);
      expect(p.text).toBe(q.text);
      expect(p.options).toEqual(draw.items[i].optionOrder.map(k => q.options[k]));
      expect(Object.keys(p).sort()).toEqual(['id', 'n', 'options', 'section', 'text']);
    });
    expect(JSON.stringify(presented)).not.toContain('"answer"');
  });
});
