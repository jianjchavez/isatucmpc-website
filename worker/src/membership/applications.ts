import type { WebsiteApplicationRecord, WebsiteApplicationRecordInput } from './record';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Returns a Philippine mobile number in local format, or an empty string. */
export function normalizeMobile(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('63') ? `0${digits.slice(2)}` : digits;
  return /^09\d{9}$/.test(local) ? local : '';
}

/** Allocates the number, summary and optional payload in one D1 transaction. */
export async function issueApplicationNo(
  db: D1Database,
  a: { fullName: string; mobile: string; email: string },
  nowIso: string,
  record?: WebsiteApplicationRecordInput,
): Promise<string> {
  const year = new Date(Date.parse(nowIso) + MANILA_OFFSET_MS).getUTCFullYear();
  // Each statement sees the same counter inside the batch, even with concurrent requests.
  const statements = [
    db.prepare('INSERT OR IGNORE INTO application_counters (year, next_seq) VALUES (?, 1)').bind(year),
    db.prepare('UPDATE application_counters SET next_seq = next_seq + 1 WHERE year = ?').bind(year),
    db.prepare(`INSERT INTO membership_applications (no, year, seq, full_name, mobile, email, created_at)
      SELECT printf('APP-%d-%04d', year, next_seq - 1), year, next_seq - 1, ?, ?, ?, ?
      FROM application_counters WHERE year = ? RETURNING no`)
      .bind(a.fullName, a.mobile, a.email, nowIso, year),
  ];
  if (record) {
    statements.push(db.prepare(`INSERT INTO application_payloads (no, payload, created_at)
      SELECT no, json_set(?, '$.version', 1, '$.applicationNo', no, '$.submittedAt', ?), ?
      FROM membership_applications WHERE year = ?
        AND seq = (SELECT next_seq - 1 FROM application_counters WHERE year = ?)`)
      .bind(JSON.stringify(record), nowIso, nowIso, year, year));
  }
  const results = await db.batch<{ no: string }>(statements);
  return results[2].results[0].no;
}

/** Stores a validated record for an already-issued number. Submission uses the atomic batch above. */
export async function storeApplicationPayload(
  db: D1Database, no: string, record: WebsiteApplicationRecordInput, nowIso: string,
): Promise<void> {
  await db.prepare('INSERT INTO application_payloads (no, payload, created_at) VALUES (?, ?, ?)')
    .bind(no, JSON.stringify({ ...record, version: 1, applicationNo: no, submittedAt: nowIso }), nowIso).run();
}

export async function getApplicationPayload(db: D1Database, no: string): Promise<WebsiteApplicationRecord | null> {
  const row = await db.prepare('SELECT payload FROM application_payloads WHERE no = ?').bind(no).first<{ payload: string }>();
  return row ? JSON.parse(row.payload) as WebsiteApplicationRecord : null;
}

/** Acknowledge only an extant payload; repeat acknowledgements preserve the original timestamp. */
export async function deletePayload(db: D1Database, no: string, nowIso: string): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE membership_applications SET pulled_at = ? WHERE no = ? AND pulled_at IS NULL
      AND EXISTS (SELECT 1 FROM application_payloads WHERE no = ?)`).bind(nowIso, no, no),
    db.prepare('DELETE FROM application_payloads WHERE no = ?').bind(no),
  ]);
}

export async function findApplication(
  db: D1Database,
  no: string,
): Promise<{ no: string; fullName: string; mobile: string; email: string } | null> {
  const row = await db
    .prepare('SELECT no, full_name, mobile, email FROM membership_applications WHERE no = ?')
    .bind(no)
    .first<{ no: string; full_name: string; mobile: string; email: string }>();
  return row ? { no: row.no, fullName: row.full_name, mobile: row.mobile, email: row.email } : null;
}
