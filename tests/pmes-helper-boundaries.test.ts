import { describe, expect, it } from 'vitest';
import { deadlineFromStep, isStep, renderResult, type Final, type Step } from '~/components/pmes-logic';
import { attemptsLabel, escapeHtml, formatManila, manilaDate, resendAttemptId, type RosterAttempt, type RosterRow } from '~/components/pmes-admin-logic';

const step: Step = {
  attemptId: 'test-attempt', fullName: 'Test Member A', total: 20, secondsLeft: 5,
  question: { n: 3, id: 'test-question', section: 'law', text: 'Test question?', options: ['A', 'B', 'C', 'D'] },
};
const final: Final = {
  score: 15, total: 20, passed: false, reviewSections: [], missed: [],
  certificateNo: null, certificateKey: null, retakesLeft: 1,
};
const attempt = (attemptNo: number, score: number, submittedAt: string | null = '2026-11-21T02:00:00Z'): RosterAttempt => ({
  attemptId: `test-${attemptNo}`, attemptNo, score, submittedAt, status: submittedAt ? 'submitted' : 'started',
});
const roster = (attempts: RosterAttempt[]): RosterRow => ({
  idType: 'member', idNumber: 'TEST-A', fullName: 'Test Member A', mobile: '', email: '',
  attempts, bestScore: null, passed: false, certificateNo: null, emailStatus: null, overrides: [],
});

describe('attendee result boundaries', () => {
  it('clamps a negative remaining time to the arrival time', () => {
    expect(deadlineFromStep({ ...step, secondsLeft: -3 }, 12_345)).toBe(12_345);
  });
  it('distinguishes stale timed steps from stale final results', () => {
    expect(isStep({ ...step, stale: true })).toBe(true);
    expect(isStep({ ...final, stale: true })).toBe(false);
  });
  it.each([[1, '1 retake left'], [2, '2 retakes left']])('shows the actionable retake count %i', (retakesLeft, label) => {
    const result = renderResult({ ...final, retakesLeft, message: 'A server message for exhausted attempts' });
    expect(result.headline).toBe(`Not yet: 15 of 20. ${label}.`);
    expect(result.detail).toContain('Review the sections below, then take the quiz again.');
    expect(result.detail).not.toContain('exhausted');
  });
  it('keeps an unfamiliar review section visible and provides a fallback when attempts are exhausted', () => {
    const result = renderResult({ ...final, reviewSections: ['new-section'], retakesLeft: 0 });
    expect(result.reviewLines).toEqual(['new-section']);
    expect(result.detail).toBe('The pass mark is 16 of 20.');
  });
});

describe('presenter result boundaries', () => {
  it('resends the latest of equal best submitted scores, ignoring an unsubmitted higher score', () => {
    const attempts = [attempt(2, 18), attempt(4, 20, null), attempt(1, 18), attempt(3, 12)];
    const before = structuredClone(attempts);
    expect(resendAttemptId(roster(attempts))).toBe('test-2');
    expect(attempts).toEqual(before);
  });
  it('retains a submitted zero score and an unfinished attempt in attempt-number order', () => {
    const attempts = [attempt(2, 20, null), attempt(1, 0)];
    expect(attemptsLabel(roster(attempts))).toBe('0, …');
    expect(attempts.map(a => a.attemptNo)).toEqual([2, 1]);
  });
  it('does not offer email resend for an unsubmitted attempt even if it carries a score', () => {
    expect(resendAttemptId(roster([attempt(1, 20, null)]))).toBeNull();
  });
  it('escapes attendee-controlled HTML and both quote kinds while preserving zero', () => {
    const raw = `<img src="x" onerror='alert(1)'>&`;
    const escaped = escapeHtml(raw);
    expect(escaped).toBe('&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;');
    const container = document.createElement('div');
    container.innerHTML = escaped;
    expect(container.children).toHaveLength(0);
    expect(container.textContent).toBe(raw);
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml(null)).toBe('');
  });
  it('uses the new Manila year at the UTC year-end boundary', () => {
    expect(formatManila('2026-12-31T15:59:59Z')).toBe('2026-12-31 23:59');
    expect(formatManila('2026-12-31T16:00:00Z')).toBe('2027-01-01 00:00');
    expect(manilaDate(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01');
  });
});
