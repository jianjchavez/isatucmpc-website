import { describe, it, expect } from 'vitest';
import { loadBank } from '../../src/pmes/bank';
import { drawQuiz } from '../../src/pmes/draw';
import { scoreAttempt } from '../../src/pmes/score';

const bank = loadBank('draft');
const draw = drawQuiz(bank);
const byId = new Map(bank.questions.map(q => [q.id, q]));
// Correct answer in presented order: the position of `answer` within optionOrder.
const correct = draw.items.map(i => i.optionOrder.indexOf(byId.get(i.id)!.answer));
const sectionOf = (i: number) => byId.get(draw.items[i].id)!.section;
const withWrong = (count: number) => correct.map((c, i) => (i < count ? (c + 1) % 4 : c));

describe('scoreAttempt', () => {
  it('all correct scores 20 of 20 and passes with no review sections', () => {
    expect(scoreAttempt(bank, draw, correct)).toEqual({ score: 20, total: 20, passed: true, reviewSections: [] });
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
    const answers = correct.map((c, i) => (idx.includes(i) ? (c + 1) % 4 : c));
    expect(scoreAttempt(bank, draw, answers).reviewSections).toEqual(['welfare']);

    const all = correct.map(c => (c + 1) % 4);
    expect(scoreAttempt(bank, draw, all)).toMatchObject({
      score: 0,
      passed: false,
      reviewSections: bank.sections.map(s => s.id),
    });
  });
});
