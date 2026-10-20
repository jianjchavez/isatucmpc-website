import { describe, it, expect } from 'vitest';
import {
  createQuizState, answer, remainingSeconds, isExpired, toSubmitPayload,
  renderResult, formatClock, sectionTitle, errorMessage,
  type Question, type SubmitResponse,
} from '~/components/pmes-logic';

const SECTIONS = ['idea', 'movement', 'story', 'products', 'welfare', 'membership', 'organization', 'documents', 'law', 'added'];
const questions: Question[] = Array.from({ length: 20 }, (_, i) => ({
  n: i + 1, id: `q${i + 1}`, section: SECTIONS[i % 10]!, text: `Question ${i + 1}?`, options: ['A', 'B', 'C', 'D'],
}));
const T0 = Date.parse('2026-11-05T01:00:00Z');
const DEADLINE = '2026-11-05T01:20:00Z';

describe('timer', () => {
  it('counts down from the deadline and reports expiry at 0', () => {
    const s = createQuizState(questions, DEADLINE, 'att-1');
    expect(remainingSeconds(s, T0)).toBe(1200);
    expect(remainingSeconds(s, T0 + 1199_500)).toBe(1);
    expect(isExpired(s, T0 + 1199_500)).toBe(false);
    expect(remainingSeconds(s, T0 + 1200_000)).toBe(0);
    expect(isExpired(s, T0 + 1200_000)).toBe(true);
    expect(remainingSeconds(s, T0 + 9999_000)).toBe(0);
  });
  it('has no timer and never expires when deadlineAt is null', () => {
    const s = createQuizState(questions, null, 'att-1');
    expect(remainingSeconds(s, T0)).toBeNull();
    expect(isExpired(s, T0 + 10 ** 12)).toBe(false);
  });
  it('formats mm:ss', () => {
    expect(formatClock(1200)).toBe('20:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(0)).toBe('00:00');
  });
});

describe('answers and payload', () => {
  it('has 20 entries with null for unanswered, keyed by n', () => {
    let s = createQuizState(questions, null, 'att-1');
    s = answer(s, 1, 2);
    s = answer(s, 20, 0);
    s = answer(s, 1, 3); // change of mind
    const p = toSubmitPayload(s);
    expect(p.attemptId).toBe('att-1');
    expect(p.answers).toHaveLength(20);
    expect(p.answers[0]).toEqual({ n: 1, choice: 3 });
    expect(p.answers[19]).toEqual({ n: 20, choice: 0 });
    expect(p.answers.filter(a => a.choice === null)).toHaveLength(18);
    expect(s.unanswered).toBe(18);
  });
});

describe('renderResult', () => {
  const base: SubmitResponse = { score: 17, total: 20, passed: true, reviewSections: ['law'], certificateNo: 'PMES-2026-0042', certificateKey: 'k', retakesLeft: 0 };
  it('pass headline carries the certificate number and review lines use section titles', () => {
    const r = renderResult(base);
    expect(r.headline).toContain('PMES-2026-0042');
    expect(r.headline).toContain('17 of 20');
    expect(r.reviewLines).toEqual(['RA 9520, the Philippine Cooperative Code']);
  });
  it('fail headline carries retakes left', () => {
    const r = renderResult({ ...base, score: 12, passed: false, certificateNo: null, certificateKey: null, retakesLeft: 2, reviewSections: ['idea', 'unknown'] });
    expect(r.headline).toContain('12 of 20');
    expect(r.headline).toContain('2 retakes left');
    expect(r.reviewLines).toEqual(['The cooperative idea', 'unknown']);
  });
  it('fail with no retakes left includes the server message', () => {
    const msg = 'Please see the Education and Training Committee. The presenter can allow another attempt.';
    const r = renderResult({ ...base, score: 10, passed: false, certificateNo: null, certificateKey: null, retakesLeft: 0, message: msg });
    expect(r.headline).toContain('0 retakes left');
    expect(r.detail).toContain(msg);
  });
});

describe('lookups', () => {
  it('maps section ids to titles and error codes to plain English', () => {
    expect(sectionTitle('welfare')).toBe('Welfare Benefits Program and health coverage');
    expect(sectionTitle('nope')).toBe('nope');
    expect(errorMessage('invalid-code')).toMatch(/session code/i);
    expect(errorMessage('bank-not-ready')).toBe('The quiz is not open yet. Please see the presenter.');
    expect(errorMessage('forbidden')).toBe('This page must be opened from the cooperative website.');
    expect(errorMessage('something-else')).toBe(errorMessage('generic'));
  });
});
