import { describe, it, expect } from 'vitest';
import { loadBank } from '../../src/pmes/bank';
import { drawQuiz } from '../../src/pmes/draw';
import { scoreAttempt } from '../../src/pmes/score';

const bank = loadBank('approved');
const draw = drawQuiz(bank);
const byId = new Map(bank.questions.map(q => [q.id, q]));
// Correct answer in presented order: the position of `answer` within optionOrder.
const correct = draw.items.map(i => i.optionOrder.indexOf(byId.get(i.id)!.answer));
const sectionOf = (i: number) => byId.get(draw.items[i].id)!.section;
// A presented position whose option is neither the answer nor an alsoCorrect option.
const wrongAt = (i: number) => {
  const q = byId.get(draw.items[i].id)!;
  const ok = [q.answer, ...(q.alsoCorrect ?? [])];
  return draw.items[i].optionOrder.findIndex(o => !ok.includes(o));
};
const accepted = (q: { options: string[]; answer: number; alsoCorrect?: number[] }) =>
  [q.answer, ...(q.alsoCorrect ?? [])].map(i => q.options[i]).join(' or ');
const withWrong = (count: number) => correct.map((c, i) => (i < count ? wrongAt(i) : c));

describe('scoreAttempt', () => {
  it('all correct scores 20 of 20 and passes with no review sections', () => {
    expect(scoreAttempt(bank, draw, correct)).toEqual({ score: 20, total: 20, passed: true, reviewSections: [], missed: [] });
  });

  it('15 correct fails, 16 passes', () => {
    expect(scoreAttempt(bank, draw, withWrong(5))).toMatchObject({ score: 15, passed: false });
    expect(scoreAttempt(bank, draw, withWrong(4))).toMatchObject({ score: 16, passed: true });
  });

  it('honours a custom pass mark', () => {
    expect(scoreAttempt(bank, draw, withWrong(5), 15).passed).toBe(true);
  });

  it('null answers count as wrong', () => {
    const answers = correct.map((c, i) => (i === 0 ? null : c));
    expect(scoreAttempt(bank, draw, answers)).toMatchObject({ score: 19, passed: true, reviewSections: [sectionOf(0)] });
  });

  it('lists a section once in bank order when any of its answers is wrong', () => {
    const idx = draw.items.map((i, k) => k).filter(k => sectionOf(k) === 'welfare');
    expect(idx).toHaveLength(2);
    const answers = correct.map((c, i) => (idx.includes(i) ? wrongAt(i) : c));
    expect(scoreAttempt(bank, draw, answers).reviewSections).toEqual(['welfare']);

    const all = correct.map((_, i) => wrongAt(i));
    expect(scoreAttempt(bank, draw, all)).toMatchObject({
      score: 0,
      passed: false,
      reviewSections: bank.sections.map(s => s.id),
    });
  });
});

it('missed items resolve shuffled answers, null answers, correct text and slide', () => {
  const items = draw.items.slice(0, 2);
  const q = items.map(item => byId.get(item.id)!);
  const wrong = wrongAt(0);
  expect(scoreAttempt(bank, { items }, [wrong, null]).missed).toEqual([
    { n: 1, text: q[0].text, yourAnswer: q[0].options[items[0].optionOrder[wrong]], correctAnswer: accepted(q[0]), slide: q[0].slide },
    { n: 2, text: q[1].text, yourAnswer: null, correctAnswer: accepted(q[1]), slide: q[1].slide },
  ]);
});

it('an alsoCorrect option scores as correct (membership-04 accepts 50 paid and 25 paid)', () => {
  const q = bank.questions.find(x => x.id === 'membership-04')!;
  expect(q.alsoCorrect).toEqual([1]);
  const one = { items: [{ id: q.id, optionOrder: [0, 1, 2, 3] }] };
  expect(scoreAttempt(bank, one, [3], 1).score).toBe(1);
  expect(scoreAttempt(bank, one, [1], 1).score).toBe(1);
  const miss = scoreAttempt(bank, one, [0], 1);
  expect(miss.score).toBe(0);
  expect(miss.missed[0].correctAnswer).toBe('50 subscribed, 50 paid or 50 subscribed, 25 paid');
});
