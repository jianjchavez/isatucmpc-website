import { describe, it, expect } from 'vitest';
import { advance, QUESTION_SECONDS, ANSWER_GRACE_MS } from '../../src/pmes/flow';

describe('advance', () => {
  it('uses 30 seconds per question and 5 seconds grace', () => {
    expect(QUESTION_SECONDS).toBe(30);
    expect(ANSWER_GRACE_MS).toBe(5000);
  });
  it.each([0, 34_999, 35_000])('does not advance after %i ms', elapsed => {
    expect(advance([2, null, null], 2, 1000, 1000 + elapsed, 3)).toEqual({ answers: [2, null, null], currentN: 2, servedAtMs: 1000 });
  });
  it('expires the current item after 35001 ms without restarting the clock', () => {
    expect(advance([2, 1, null], 2, 1000, 36_001, 3)).toEqual({ answers: [2, null, null], currentN: 3, servedAtMs: 31_000 });
  });
  it('expires five items at three minutes while question six is within grace', () => {
    expect(advance(Array(20).fill(null), 1, 1000, 181_000, 20)).toEqual({ answers: Array(20).fill(null), currentN: 6, servedAtMs: 151_000 });
  });
  it('expires six items after three minutes and six seconds', () => {
    expect(advance(Array(20).fill(null), 1, 1000, 187_000, 20)).toEqual({ answers: Array(20).fill(null), currentN: 7, servedAtMs: 181_000 });
  });
  it('stops past the last item', () => {
    expect(advance([null, null], 1, 1000, 181_000, 2)).toEqual({ answers: [null, null], currentN: 3, servedAtMs: 61_000 });
  });
});
