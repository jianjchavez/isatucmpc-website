const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Returns a Philippine mobile number in local format, or an empty string. */
export function normalizeMobile(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('63') ? `0${digits.slice(2)}` : digits;
  return /^09\d{9}$/.test(local) ? local : '';
}

/** Allocates and stores the next application number for the Manila year of `nowIso`. */
export async function issueApplicationNo(
  db: D1Database,
  a: { fullName: string; mobile: string; email: string },
  nowIso: string,
): Promise<string> {
  const year = new Date(Date.parse(nowIso) + MANILA_OFFSET_MS).getUTCFullYear();
  await db.prepare('INSERT OR IGNORE INTO application_counters (year, next_seq) VALUES (?, 1)').bind(year).run();
  const row = await db
    .prepare('UPDATE application_counters SET next_seq = next_seq + 1 WHERE year = ? RETURNING next_seq')
    .bind(year)
    .first<{ next_seq: number }>();
  const seq = row!.next_seq - 1;
  const no = `APP-${year}-${String(seq).padStart(4, '0')}`;
  await db
    .prepare('INSERT INTO membership_applications (no, year, seq, full_name, mobile, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(no, year, seq, a.fullName, a.mobile, a.email, nowIso)
    .run();
  return no;
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
