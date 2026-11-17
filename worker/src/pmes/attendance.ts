// Face-to-face PMES: no quiz (Board and Education and Training Committee, 2026-11-17).
// Attendees check themselves in with the code the presenter shows at the end of the seminar; the
// presenter confirms who attended, which issues each certificate from the shared PMES-YYYY-NNNN counter.
// A check-in is a pmes_attempts row with status 'attended', an empty draw and no score.
import type { PmesEnv } from './env';
import type { SessionRow } from './sessions';
import { issueCertificate } from './certificates';
import { sendAttendanceEmails, type AttemptRow } from './email';

const hexId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

export type Attendee = { idType: string; idNumber: string; fullName: string; mobile: string; email: string };

/** Records a check-in once per identity per session; a repeat returns the same row. */
export async function checkIn(db: D1Database, session: SessionRow, a: Attendee, nowIso: string) {
  await db
    .prepare(
      `INSERT INTO pmes_attempts (id, session_id, attempt_no, id_type, id_number, full_name, mobile, email, consent_at, draw_json, started_at, status)
       SELECT ?, ?, 1, ?, ?, ?, ?, ?, ?, '[]', ?, 'attended'
       WHERE NOT EXISTS (SELECT 1 FROM pmes_attempts WHERE session_id = ? AND id_type = ? AND id_number = ?)`,
    )
    .bind(hexId(), session.id, a.idType, a.idNumber, a.fullName, a.mobile, a.email, nowIso, nowIso, session.id, a.idType, a.idNumber)
    .run();
  const row = await db
    .prepare('SELECT status FROM pmes_attempts WHERE session_id = ? AND id_type = ? AND id_number = ? ORDER BY attempt_no LIMIT 1')
    .bind(session.id, a.idType, a.idNumber)
    .first<{ status: string }>();
  return { checkedIn: true as const, fullName: a.fullName, confirmed: row?.status === 'submitted' };
}

/**
 * Confirms the given check-ins: each becomes a pass with no score, gets the next certificate number
 * and an email. Rows that are not unconfirmed check-ins of this session are skipped.
 */
export async function confirmAttendance(env: PmesEnv, session: SessionRow, attemptIds: string[], nowIso: string) {
  const db = env.PMES_DB;
  const issued: { attemptId: string; certificateNo: string; emailStatus: 'sent' | 'failed' }[] = [];
  for (const id of attemptIds) {
    const done = await db
      .prepare(`UPDATE pmes_attempts SET status = 'submitted', passed = 1, submitted_at = ?
        WHERE id = ? AND session_id = ? AND status = 'attended'`)
      .bind(nowIso, id, session.id)
      .run();
    if (!done.meta.changes) continue;
    const certificate = await issueCertificate(db, id, nowIso);
    const attempt = await db
      .prepare(`SELECT a.*, s.session_date, s.code, s.presenter_name FROM pmes_attempts a
        JOIN pmes_sessions s ON s.id = a.session_id WHERE a.id = ?`)
      .bind(id)
      .first<AttemptRow>();
    const emailStatus = await sendAttendanceEmails(env, attempt!, session.venue, certificate);
    await db.prepare('UPDATE pmes_certificates SET email_status = ? WHERE no = ?').bind(emailStatus, certificate.no).run();
    issued.push({ attemptId: id, certificateNo: certificate.no, emailStatus });
  }
  return issued;
}
