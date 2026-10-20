// Roster per identity for the admin page, results sheet and CSV (spec §3.1 step 4-5, §9).

export type RosterAttempt = { attemptId: string; attemptNo: number; score: number | null; status: string; submittedAt: string | null };
export type RosterRow = {
  idType: string;
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
};
export type RosterTotals = { attended: number; passed: number; failed: number };

type AttemptRow = {
  id: string; attempt_no: number; id_type: string; id_number: string; full_name: string; mobile: string; email: string;
  score: number | null; passed: number | null; status: string; submitted_at: string | null;
  certificate_no: string | null; email_status: string | null;
};
type OverrideRow = { id_type: string; id_number: string; reason: string; presenter_name: string; created_at: string };

export async function buildRoster(db: D1Database, sessionId: number): Promise<{ rows: RosterRow[]; totals: RosterTotals }> {
  const [attempts, overrides] = await Promise.all([
    db
      .prepare(
        `SELECT a.id, a.attempt_no, a.id_type, a.id_number, a.full_name, a.mobile, a.email, a.score, a.passed, a.status, a.submitted_at,
                c.no AS certificate_no, c.email_status
         FROM pmes_attempts a LEFT JOIN pmes_certificates c ON c.attempt_id = a.id
         WHERE a.session_id = ? ORDER BY a.attempt_no`,
      )
      .bind(sessionId)
      .all<AttemptRow>(),
    db
      .prepare(
        `SELECT o.id_type, o.id_number, o.reason, p.display_name AS presenter_name, o.created_at
         FROM pmes_overrides o JOIN pmes_presenters p ON p.id = o.presenter_id
         WHERE o.session_id = ? ORDER BY o.id`,
      )
      .bind(sessionId)
      .all<OverrideRow>(),
  ]);

  const byId = new Map<string, RosterRow>();
  const key = (r: { id_type: string; id_number: string }) => `${r.id_type}:${r.id_number}`;
  for (const a of attempts.results) {
    let row = byId.get(key(a));
    if (!row) {
      row = { idType: a.id_type, idNumber: a.id_number, fullName: '', mobile: '', email: '', attempts: [], bestScore: null, passed: false, certificateNo: null, emailStatus: null, overrides: [] };
      byId.set(key(a), row);
    }
    // attempts arrive in attempt_no order, so the last one seen is the latest
    row.fullName = a.full_name;
    row.mobile = a.mobile;
    row.email = a.email;
    row.attempts.push({ attemptId: a.id, attemptNo: a.attempt_no, score: a.score, status: a.status, submittedAt: a.submitted_at });
    if (a.score !== null && (row.bestScore === null || a.score > row.bestScore)) row.bestScore = a.score;
    if (a.passed === 1) row.passed = true;
    if (a.certificate_no) {
      row.certificateNo = a.certificate_no;
      row.emailStatus = a.email_status;
    }
  }
  for (const o of overrides.results) {
    byId.get(key(o))?.overrides.push({ reason: o.reason, presenterName: o.presenter_name, createdAt: o.created_at });
  }

  const rows = [...byId.values()].sort((a, b) => a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase()));
  const passed = rows.filter(r => r.passed).length;
  const failed = rows.filter(r => !r.passed && r.attempts.some(a => a.status !== 'started')).length;
  return { rows, totals: { attended: rows.length, passed, failed } };
}

export const resultLabel = (r: RosterRow): string =>
  r.passed ? 'Passed' : r.attempts.some(a => a.status !== 'started') ? 'Failed' : 'In progress';

const csvField = (v: string | number | null) => {
  let s = v === null ? '' : String(v);
  // Spreadsheets treat a leading = + - @ or tab as a formula: neutralize it.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function rosterCsv(rows: RosterRow[]): string {
  const header = ['No.', 'Name', 'ID type', 'ID number', 'Mobile', 'Email', 'Attempts', 'Best score', 'Result', 'Certificate No.', 'Email status', 'Overrides'];
  const lines = rows.map((r, i) => [
    i + 1,
    r.fullName,
    r.idType,
    r.idNumber,
    r.mobile,
    r.email,
    r.attempts.filter(a => a.score !== null).map(a => a.score).join(' / '),
    r.bestScore,
    resultLabel(r),
    r.certificateNo,
    r.emailStatus,
    r.overrides.length,
  ]);
  return '﻿' + [header, ...lines].map(l => l.map(csvField).join(',')).join('\r\n') + '\r\n';
}
