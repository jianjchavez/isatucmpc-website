import { describe, it, expect } from 'vitest';
import {
  deadlineFromStep, renderResult, formatClock, sectionTitle, errorMessage,
  type Step, type Final,
} from '~/components/pmes-logic';

const step: Step = {
  attemptId: 'att-1', fullName: 'Juan Dela Cruz', total: 20, secondsLeft: 25,
  question: { n: 7, id: 'q7', section: 'law', text: 'Question 7?', options: ['A', 'B', 'C', 'D'] },
};
const final: Final = {
  score: 17, total: 20, passed: true, reviewSections: ['law'], missed: [
    { n: 2, text: 'Question 2?', yourAnswer: null, correctAnswer: 'B', slide: 4 },
    { n: 7, text: 'Question 7?', yourAnswer: 'A', correctAnswer: 'C', slide: 8 },
  ], certificateNo: 'PMES-2026-0042', certificateKey: 'k', retakesLeft: 0,
};

describe('timed step', () => {
  it('makes a local deadline from seconds remaining when the step arrives', () => {
    expect(deadlineFromStep(step, 1_000_000)).toBe(1_025_000);
    expect(deadlineFromStep({ ...step, secondsLeft: 0 }, 1_000_000)).toBe(1_000_000);
  });
  it('formats the countdown', () => {
    expect(formatClock(25)).toBe('00:25');
    expect(formatClock(0)).toBe('00:00');
  });
});

describe('result', () => {
  it('shows missed questions and distinguishes a timed-out answer', () => {
    const r = renderResult(final);
    expect(r.headline).toContain('17 of 20');
    expect(r.reviewLines).toEqual(['RA 9520, the Philippine Cooperative Code']);
    expect(r.missedLines).toEqual([
      { question: 'Question 2?', yours: 'No answer (time ran out)', correct: 'B', slide: 4 },
      { question: 'Question 7?', yours: 'A', correct: 'C', slide: 8 },
    ]);
  });
  it('keeps the retake and server message copy', () => {
    const r = renderResult({ ...final, passed: false, score: 10, certificateNo: null, certificateKey: null, retakesLeft: 0, message: 'See the committee.' });
    expect(r.headline).toContain('0 retakes left');
    expect(r.detail).toContain('See the committee.');
  });
});

describe('lookups', () => {
  it('explains application identity mismatch without exposing applicant data', () => {
    expect(errorMessage('unknown-application')).toBe('That application number and mobile number do not match our records. Use the number on your application form and the mobile number you gave.');
  });
  it('keeps section titles and generic fallback', () => {
    expect(sectionTitle('welfare')).toBe('Welfare Benefits Program and health coverage');
    expect(errorMessage('something-else')).toBe(errorMessage('generic'));
  });
});
