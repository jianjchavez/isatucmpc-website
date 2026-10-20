import type { Bank } from './bank';
import type { Draw } from './draw';

export type Result = { score: number; total: number; passed: boolean; reviewSections: string[] };

export function scoreAttempt(bank: Bank, draw: Draw, answers: (number | null)[], passMark = 16): Result {
  const byId = new Map(bank.questions.map(q => [q.id, q]));
  const missed = new Set<string>();
  let score = 0;
  draw.items.forEach((item, i) => {
    const q = byId.get(item.id);
    if (!q) throw new Error(`unknown-question:${item.id}`);
    const chosen = answers[i];
    if (chosen !== null && chosen !== undefined && item.optionOrder[chosen] === q.answer) score++;
    else missed.add(q.section);
  });
  return {
    score,
    total: draw.items.length,
    passed: score >= passMark,
    reviewSections: bank.sections.map(s => s.id).filter(id => missed.has(id)),
  };
}
