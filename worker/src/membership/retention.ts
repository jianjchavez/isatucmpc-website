/** Delete expired payloads atomically with their non-PII expiry marker. */
export async function purgeExpiredPayloads(db: D1Database, nowIso: string, days = 90): Promise<number> {
  const cutoff = new Date(Date.parse(nowIso) - days * 86400000).toISOString();
  const results = await db.batch([
    db.prepare(`UPDATE membership_applications SET payload_expired_at = ?
      WHERE pulled_at IS NULL AND no IN (
        SELECT no FROM application_payloads WHERE created_at <= ?
      )`).bind(nowIso, cutoff),
    db.prepare('DELETE FROM application_payloads WHERE created_at <= ?').bind(cutoff),
  ]);
  return results[1].meta.changes;
}
