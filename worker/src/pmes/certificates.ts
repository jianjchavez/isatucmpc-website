// Certificate numbering, fetch and public verification
// (spec docs/superpowers/specs/2026-10-21-pmes-quiz-design.md §6, §9).

export type CertificateRecord = {
  no: string;
  fullName: string;
  idType: string;
  idNumber: string;
  sessionDate: string;
  venue: string;
  code: string;
  presenterName: string;
  chairName: string;
  score: number;
  total: number;
  issuedAt: string;
  verifyUrl: string;
};

export type Verification = {
  no: string;
  fullName: string;
  idNumber: string;
  sessionDate: string;
  score: number;
  total: number;
  passed: true;
  presenterName: string;
  issuedAt: string;
};

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Issues the next `PMES-YYYY-NNNN` for the attempt; the year is the Manila date of `nowIso`. */
export async function issueCertificate(
  db: D1Database,
  attemptId: string,
  nowIso: string,
): Promise<{ no: string; key: string }> {
  const ok = await db
    .prepare('SELECT 1 AS ok FROM pmes_attempts WHERE id = ? AND passed = 1')
    .bind(attemptId)
    .first<{ ok: number }>();
  if (!ok) throw new Error('attempt-not-passed');
  const year = new Date(Date.parse(nowIso) + MANILA_OFFSET_MS).getUTCFullYear();
  await db.prepare('INSERT OR IGNORE INTO pmes_counters (year, next_seq) VALUES (?, 1)').bind(year).run();
  const row = await db
    .prepare('UPDATE pmes_counters SET next_seq = next_seq + 1 WHERE year = ? RETURNING next_seq')
    .bind(year)
    .first<{ next_seq: number }>();
  const seq = row!.next_seq - 1;
  const no = `PMES-${year}-${String(seq).padStart(4, '0')}`;
  const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  await db
    .prepare('INSERT INTO pmes_certificates (no, year, seq, attempt_id, key, issued_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(no, year, seq, attemptId, key, nowIso)
    .run();
  return { no, key };
}

const CERT_SELECT = `SELECT c.no, c.key, c.issued_at, a.full_name, a.id_type, a.id_number, a.score, a.passed, a.draw_json,
  s.session_date, s.venue, s.code, s.presenter_name, s.chair_name
  FROM pmes_certificates c
  JOIN pmes_attempts a ON a.id = c.attempt_id
  JOIN pmes_sessions s ON s.id = a.session_id
  WHERE c.no = ?`;

type CertRow = {
  no: string; key: string; issued_at: string; full_name: string; id_type: string; id_number: string;
  score: number; passed: number; draw_json: string;
  session_date: string; venue: string; code: string; presenter_name: string; chair_name: string;
};

/** Full record for the print page, or null when `key` does not match. */
export async function getCertificate(
  db: D1Database,
  no: string,
  key: string,
  siteUrl: string,
): Promise<CertificateRecord | null> {
  const r = await db.prepare(`${CERT_SELECT} AND a.passed = 1`).bind(no).first<CertRow>();
  if (!r || !constantTimeEqual(r.key, key)) return null;
  return {
    no: r.no,
    fullName: r.full_name,
    idType: r.id_type,
    idNumber: r.id_number,
    sessionDate: r.session_date,
    venue: r.venue,
    code: r.code,
    presenterName: r.presenter_name,
    chairName: r.chair_name,
    score: r.score,
    total: JSON.parse(r.draw_json).length,
    issuedAt: r.issued_at,
    verifyUrl: `${siteUrl}/pmes/verify/?no=${no}`,
  };
}

/** Public lookups show only the tail of the ID number (certificate numbers are sequential). */
export function maskId(id: string): string {
  return id.length <= 4 ? id : `${'•'.repeat(id.length - 4)}${id.slice(-4)}`;
}

/** Public subset for `/pmes/verify/`, or null when there is no certificate for a passed attempt. */
export async function getVerification(db: D1Database, no: string): Promise<Verification | null> {
  const r = await db.prepare(`${CERT_SELECT} AND a.passed = 1`).bind(no).first<CertRow>();
  if (!r) return null;
  return {
    no: r.no,
    fullName: r.full_name,
    idNumber: maskId(r.id_number),
    sessionDate: r.session_date,
    score: r.score,
    total: JSON.parse(r.draw_json).length,
    passed: true,
    presenterName: r.presenter_name,
    issuedAt: r.issued_at,
  };
}

function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1));
  return diff === 0;
}
