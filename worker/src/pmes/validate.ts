// Field validation and the per-identity attempt limit (spec §3.2 step 2, §5).

export const isPhMobile = (s: string): boolean => /^09\d{9}$/.test(s);
export const isEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** base attempts + 3 per committee override for this identity in this session. */
export async function attemptLimit(
  db: D1Database,
  sessionId: number,
  idType: string,
  idNumber: string,
  base: number,
): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(SUM(extra_attempts), 0) AS extra FROM pmes_overrides WHERE session_id = ? AND id_type = ? AND id_number = ?')
    .bind(sessionId, idType, idNumber)
    .first<{ extra: number }>();
  return base + (row?.extra ?? 0);
}
