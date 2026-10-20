// Pure helpers for the PMES presenter pages (/pmes/admin/ and the results sheet).
// Shapes mirror the admin API (spec §5, plan Task 10).

export interface AdminSession {
  id: number | string;
  code: string;
  sessionDate: string;
  venue: string;
  presenterName: string;
  chairName: string;
  timerMinutes: number;
  status: string;
  createdAt: string;
  closedAt: string | null;
}

export interface RosterAttempt {
  attemptId: string;
  attemptNo: number;
  score: number;
  status: string;
  submittedAt: string | null;
}

export interface RosterRow {
  idType: 'application' | 'member';
  idNumber: string;
  fullName: string;
  mobile: string;
  email: string;
  attempts: RosterAttempt[];
  bestScore: number | null;
  passed: boolean;
  certificateNo: string | null;
  emailStatus: string | null;
  overrides: { reason: string; presenterName: string; createdAt: string }[];
}

export interface RosterTotals { attended: number; passed: number; failed: number }

export function rosterTotals(rows: RosterRow[]): RosterTotals {
  const passed = rows.filter(r => r.passed).length;
  return { attended: rows.length, passed, failed: rows.length - passed };
}

export function csvFilename(session: Pick<AdminSession, 'sessionDate' | 'code'>): string {
  return `PMES-${session.sessionDate}-${session.code}.csv`;
}

export function sortRowsByName(rows: RosterRow[]): RosterRow[] {
  return [...rows].sort((a, b) => a.fullName.localeCompare(b.fullName, 'en', { sensitivity: 'base' }));
}

const manilaFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

/** `YYYY-MM-DD HH:mm` in Asia/Manila; empty for a missing value. */
export function formatManila(iso: string | null | undefined): string {
  if (!iso) return '';
  return manilaFmt.format(new Date(iso)).replace(',', '');
}

/** Manila calendar date `YYYY-MM-DD`. */
export function manilaDate(d = new Date()): string {
  return formatManila(d.toISOString()).slice(0, 10);
}

const submitted = (r: RosterRow) => r.attempts.filter(a => a.submittedAt);

export function resultLabel(row: RosterRow): string {
  if (row.passed) return 'Passed';
  return submitted(row).length ? 'Failed' : 'In progress';
}

export function attemptsLabel(row: RosterRow): string {
  return [...row.attempts]
    .sort((a, b) => a.attemptNo - b.attemptNo)
    .map(a => (a.submittedAt ? String(a.score) : '…'))
    .join(', ');
}

export function idLabel(row: Pick<RosterRow, 'idType' | 'idNumber'>): string {
  return `${row.idType === 'member' ? 'Member' : 'Application'} No. ${row.idNumber}`;
}

/** The attempt whose result email should be re-sent: the best submitted one. */
export function resendAttemptId(row: RosterRow): string | null {
  const best = submitted(row).sort((a, b) => b.score - a.score || b.attemptNo - a.attemptNo)[0];
  return best ? best.attemptId : null;
}

export function latestChairName(sessions: Pick<AdminSession, 'chairName' | 'createdAt'>[]): string {
  const latest = [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return latest ? latest.chairName : '';
}

export function escapeHtml(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
