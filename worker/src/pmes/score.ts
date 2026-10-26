import type { Bank } from './bank';
import type { Draw } from './draw';
import type { Missed } from './flow';

export type Result = { score: number; total: number; passed: boolean; reviewSections: string[]; missed: Missed[] };

export function scoreAttempt(bank: Bank, draw: Draw, answers: (number | null)[], passMark = 16): Result {
  const byId = new Map(bank.questions.map(q => [q.id, q]));
  const missedSections = new Set<string>();
  const missed: Missed[] = [];
  let score = 0;
  draw.items.forEach((item, i) => {
    const q = byId.get(item.id);
    if (!q) throw new Error(`unknown-question:${item.id}`);
    const chosen = answers[i];
    if (chosen !== null && chosen !== undefined && item.optionOrder[chosen] === q.answer) score++;
    else {
      missedSections.add(q.section);
      missed.push({
        n: i + 1, text: q.text,
        yourAnswer: chosen == null ? null : q.options[item.optionOrder[chosen]] ?? null,
        correctAnswer: q.options[q.answer], slide: q.slide,
      });
    }
  });
  return {
    score,
    total: draw.items.length,
    passed: score >= passMark,
    reviewSections: bank.sections.map(s => s.id).filter(id => missedSections.has(id)),
    missed,
  };
}
