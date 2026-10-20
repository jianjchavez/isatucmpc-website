// POST /submit, GET /certificate, GET /verify (spec §5; plan Tasks 7 and 8).
import { Hono } from 'hono';
import type { PmesEnv } from './env';
import { loadBank } from './bank';
import type { Draw } from './draw';
import { scoreAttempt } from './score';
import { issueCertificate } from './certificates';
import { sendResultEmails, type AttemptRow } from './email';
import { attemptLimit } from './validate';

export const submit = new Hono<{ Bindings: PmesEnv }>();

const GRACE_MS = 120e3;
const NO_RETAKES = 'Please see the Education and Training Committee. The presenter can allow another attempt.';

/** Every question regardless of status: a draw made under 'draft' must still score after the bank is approved. */
function fullBank() {
  const approved = loadBank('approved');
  return { sections: approved.sections, questions: [...approved.questions, ...loadBank('draft').questions] };
}

submit.post('/submit', async c => {
  type Body = { attemptId?: unknown; answers?: unknown };
  const raw: Body = await c.req.json<Body>().catch(() => ({}));
  if (typeof raw.attemptId !== 'string' || !Array.isArray(raw.answers)) return c.json({ error: 'missing-fields' }, 400);

  const db = c.env.PMES_DB;
  const attempt = await db
    .prepare('SELECT a.*, s.session_date, s.code, s.presenter_name FROM pmes_attempts a JOIN pmes_sessions s ON s.id = a.session_id WHERE a.id = ?')
    .bind(raw.attemptId)
    .first<AttemptRow>();
  if (!attempt) return c.json({ error: 'unknown-attempt' }, 404);
  if (attempt.status !== 'started') return c.json({ error: 'already-submitted' }, 409);

  const now = new Date().toISOString();
  const draw: Draw = { items: JSON.parse(attempt.draw_json) };
  const total = draw.items.length;
  const answers: (number | null)[] = Array(total).fill(null);
  for (const a of raw.answers as { n?: unknown; choice?: unknown }[]) {
    const i = Number(a?.n) - 1;
    const choice = a?.choice;
    if (Number.isInteger(i) && i >= 0 && i < total && Number.isInteger(choice) && (choice as number) >= 0 && (choice as number) <= 3) answers[i] = choice as number;
  }

  const expired = attempt.deadline_at !== null && Date.parse(now) > Date.parse(attempt.deadline_at) + GRACE_MS;
  const result = expired
    ? { score: 0, total, passed: false, reviewSections: [] as string[] }
    : scoreAttempt(fullBank(), draw, answers, Number(c.env.PMES_PASS_MARK) || 16);
  await db
    .prepare('UPDATE pmes_attempts SET answers_json = ?, score = ?, passed = ?, submitted_at = ?, status = ? WHERE id = ?')
    .bind(JSON.stringify(answers), result.score, result.passed ? 1 : 0, now, expired ? 'expired' : 'submitted', attempt.id)
    .run();

  const limit = await attemptLimit(db, attempt.session_id, attempt.id_type, attempt.id_number, Number(c.env.PMES_MAX_ATTEMPTS) || 3);
  const retakesLeft = result.passed ? 0 : Math.max(0, limit - attempt.attempt_no);
  if (expired) return c.json({ error: 'expired', score: 0, total, passed: false, retakesLeft }, 410);

  const certificate = result.passed ? await issueCertificate(db, attempt.id, now) : null;
  const emailStatus = await sendResultEmails(c.env, attempt, { score: result.score, total, passed: result.passed, retakesLeft }, certificate);
  if (certificate) await db.prepare('UPDATE pmes_certificates SET email_status = ? WHERE no = ?').bind(emailStatus, certificate.no).run();

  return c.json({
    score: result.score,
    total,
    passed: result.passed,
    reviewSections: result.reviewSections,
    certificateNo: certificate?.no ?? null,
    certificateKey: certificate?.key ?? null,
    retakesLeft,
    ...(!result.passed && retakesLeft === 0 ? { message: NO_RETAKES } : {}),
  });
});
