// Session codes and Manila-day validity (spec §3.1 step 2).
// A standing online session (board paper Item 3, behind PMES_SELF_PACED) stores
// session_date as YYYY-MM, with no day: it is valid for that whole Manila month.

export const SESSION_COLUMNS = 'id, code, session_date, venue, presenter_name, chair_name, presenter_id, status, created_at, closed_at';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export type Random = (n: number) => number;

export type SessionRow = {
  id: number;
  code: string;
  session_date: string;
  venue: string;
  presenter_name: string;
  chair_name: string;
  presenter_id: number;
  status: 'open' | 'closed';
  created_at: string;
  closed_at: string | null;
};

export type SessionInput = {
  sessionDate: string;
  venue: string;
  presenterName: string;
  chairName: string;
  presenterId: number;
};

const cryptoRandom: Random = n => {
  const buf = new Uint32Array(1);
  const limit = 2 ** 32 - ((2 ** 32) % n);
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % n;
};

export function generateCode(random: Random = cryptoRandom): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[random(ALPHABET.length)];
  return `PMES-${s}`;
}

/** 23:59:59 Asia/Manila on sessionDate, as a UTC instant. */
export function manilaDayEnd(sessionDate: string): string {
  return `${sessionDate}T15:59:59.000Z`;
}

function manilaDate(iso: string): string {
  return new Date(Date.parse(iso) + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

export async function createSession(
  db: D1Database,
  input: SessionInput,
  random: Random = cryptoRandom,
): Promise<SessionRow> {
  const createdAt = new Date().toISOString();
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateCode(random);
    try {
      const row = await db
        .prepare(
          `INSERT INTO pmes_sessions (code, session_date, venue, presenter_name, chair_name, presenter_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING ${SESSION_COLUMNS}`,
        )
        .bind(code, input.sessionDate, input.venue, input.presenterName, input.chairName, input.presenterId, createdAt)
        .first<SessionRow>();
      if (row) return row;
    } catch (err) {
      if (!/UNIQUE/.test(String(err))) throw err;
    }
  }
  throw new Error('could not allocate a unique session code');
}

/** True for a standing online session, whose session_date is a month (YYYY-MM). */
export const isMonthSession = (sessionDate: string) => /^\d{4}-\d{2}$/.test(sessionDate);

export async function findOpenSession(
  db: D1Database,
  code: string,
  nowIso: string,
  selfPaced = false,
): Promise<SessionRow | 'invalid-code' | 'session-closed' | 'code-expired'> {
  const { results } = await db
    .prepare(`SELECT ${SESSION_COLUMNS} FROM pmes_sessions WHERE code = ? ORDER BY session_date DESC, id DESC`)
    .bind(code.trim().toUpperCase())
    .all<SessionRow>();
  if (results.length === 0) return 'invalid-code';
  // A code is valid only during its session's Manila day: from 00:00:00 to
  // 23:59:59 Asia/Manila on session_date. A future session's code is not
  // yet valid and is indistinguishable from an unknown code.
  // A month session (YYYY-MM) is valid from 00:00:00 on the 1st to 23:59:59 on the
  // last day of that Manila month, and only while PMES_SELF_PACED is on. With the
  // switch off it never matches: 'YYYY-MM' sorts before every day of its month, so
  // it reads as expired from the 1st and as unknown before.
  const today = manilaDate(nowIso);
  const row = results.find(r => r.session_date === today || (selfPaced && r.session_date === today.slice(0, 7)));
  if (!row) return results.every(r => r.session_date > today) ? 'invalid-code' : 'code-expired';
  if (row.status !== 'open') return 'session-closed';
  return row;
}

export async function closeSession(db: D1Database, id: number, nowIso: string): Promise<void> {
  await db.prepare("UPDATE pmes_sessions SET status = 'closed', closed_at = ? WHERE id = ?").bind(nowIso, id).run();
}

/** The open standing online session for the Manila month containing nowIso, if any. */
export async function findOnlineSession(db: D1Database, nowIso: string): Promise<SessionRow | null> {
  return db
    .prepare(`SELECT ${SESSION_COLUMNS} FROM pmes_sessions WHERE session_date = ? AND status = 'open' ORDER BY id LIMIT 1`)
    .bind(manilaDate(nowIso).slice(0, 7))
    .first<SessionRow>();
}

/** SQL for the date printed on certificates: a month session shows the Manila day the attempt was submitted. */
export const PRINTED_SESSION_DATE = `CASE WHEN length(s.session_date) = 7
  THEN COALESCE(date(a.submitted_at, '+8 hours'), s.session_date) ELSE s.session_date END`;
