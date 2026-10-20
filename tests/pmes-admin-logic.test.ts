import { describe, it, expect } from 'vitest';
import {
  rosterTotals, csvFilename, sortRowsByName, formatManila, manilaDate, resultLabel,
  attemptsLabel, resendAttemptId, idLabel, latestChairName, type RosterRow,
} from '~/components/pmes-admin-logic';

const attempt = (attemptNo: number, score: number, submitted = true, status = 'submitted') => ({
  attemptId: `a${attemptNo}`, attemptNo, score, status, submittedAt: submitted ? `2026-10-25T0${attemptNo}:00:00Z` : null,
});
const row = (fullName: string, over: Partial<RosterRow> = {}): RosterRow => ({
  idType: 'application', idNumber: 'A-1', fullName, mobile: '', email: '',
  attempts: [], bestScore: null, passed: false, certificateNo: null, emailStatus: null, overrides: [], ...over,
});

describe('rosterTotals', () => {
  it('counts attended, passed and failed from the rows', () => {
    const rows = [row('A', { passed: true }), row('B', { passed: true }), row('C')];
    expect(rosterTotals(rows)).toEqual({ attended: 3, passed: 2, failed: 1 });
  });
  it('is all zeros for an empty roster', () => {
    expect(rosterTotals([])).toEqual({ attended: 0, passed: 0, failed: 0 });
  });
});

describe('csvFilename', () => {
  it('is PMES-<date>-<code>.csv', () => {
    expect(csvFilename({ sessionDate: '2026-10-25', code: 'PMES-7KQ2' })).toBe('PMES-2026-10-25-PMES-7KQ2.csv');
  });
});

describe('sortRowsByName', () => {
  it('orders by name, case-insensitively, without mutating the input', () => {
    const rows = [row('delos Santos'), row('Abad'), row('cruz'), row('Bautista')];
    expect(sortRowsByName(rows).map(r => r.fullName)).toEqual(['Abad', 'Bautista', 'cruz', 'delos Santos']);
    expect(rows[0].fullName).toBe('delos Santos');
  });
});

describe('Manila time helpers', () => {
  it('formatManila renders YYYY-MM-DD HH:mm in Asia/Manila', () => {
    expect(formatManila('2026-10-21T16:30:00Z')).toBe('2026-10-22 00:30');
  });
  it('formatManila is blank for a missing value', () => {
    expect(formatManila(null)).toBe('');
  });
  it('manilaDate gives the Manila calendar date', () => {
    expect(manilaDate(new Date('2026-10-21T16:30:00Z'))).toBe('2026-10-22');
  });
});

describe('row labels', () => {
  it('resultLabel: Passed, Failed, or In progress', () => {
    expect(resultLabel(row('A', { passed: true, attempts: [attempt(1, 18)] }))).toBe('Passed');
    expect(resultLabel(row('B', { attempts: [attempt(1, 12)] }))).toBe('Failed');
    expect(resultLabel(row('C', { attempts: [attempt(1, 0, false, 'open')] }))).toBe('In progress');
  });
  it('attemptsLabel lists scores by attempt number, with … for an open attempt', () => {
    const r = row('A', { attempts: [attempt(2, 15), attempt(1, 12), attempt(3, 0, false, 'open')] });
    expect(attemptsLabel(r)).toBe('12, 15, …');
  });
  it('idLabel names the ID kind', () => {
    expect(idLabel(row('A', { idType: 'member', idNumber: '1234' }))).toBe('Member No. 1234');
    expect(idLabel(row('A', { idType: 'application', idNumber: 'A-77' }))).toBe('Application No. A-77');
  });
  it('resendAttemptId picks the best submitted attempt, or null', () => {
    expect(resendAttemptId(row('A', { attempts: [attempt(1, 12), attempt(2, 17), attempt(3, 0, false, 'open')] }))).toBe('a2');
    expect(resendAttemptId(row('B'))).toBeNull();
  });
});

describe('latestChairName', () => {
  it('takes the chair name from the most recently created session', () => {
    const sessions = [
      { chairName: 'Old Chair', createdAt: '2026-09-01T00:00:00Z' },
      { chairName: 'New Chair', createdAt: '2026-10-01T00:00:00Z' },
    ];
    expect(latestChairName(sessions)).toBe('New Chair');
    expect(latestChairName([])).toBe('');
  });
});
