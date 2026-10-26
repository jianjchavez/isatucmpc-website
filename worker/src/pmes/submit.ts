// Timed answers, reload recovery, result finalization and certificate lookups.
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { PmesEnv } from './env';
import { loadBank, allQuestions } from './bank';
import { presentDraw, type Draw } from './draw';
import { scoreAttempt } from './score';
import { issueCertificate, getCertificate, getVerification } from './certificates';
import { sendResultEmails, type AttemptRow } from './email';
import { attemptLimit } from './validate';
import { advance, QUESTION_SECONDS, type Step, type Final } from './flow';

export const submit = new Hono<{ Bindings: PmesEnv }>();
type PmesContext = Context<{ Bindings: PmesEnv }>;
type TimedAttempt = AttemptRow & { current_n: number; served_at: string | null };
type Answer = { n: unknown; choice: unknown };

const NO_RETAKES = 'Please see the Education and Training Committee. The presenter can allow another attempt.';
const fullBank = () => ({ sections: loadBank('approved').sections, questions: allQuestions() });
const loadAttempt = (db: D1Database, id: string) => db
  .prepare('SELECT a.*, s.session_date, s.code, s.presenter_name FROM pmes_attempts a JOIN pmes_sessions s ON s.id = a.session_id WHERE a.id = ?')
  .bind(id).first<TimedAttempt>();
const storedAnswers = (a: TimedAttempt): (number | null)[] =>
  a.answers_json ? JSON.parse(a.answers_json) : Array(JSON.parse(a.draw_json).length).fill(null);

/** Rebuild review details but retain the score/pass decision stored at submission. */
async function finalResult(c: PmesContext, attempt: TimedAttempt): Promise<Final> {
  const result = scoreAttempt(fullBank(), { items: JSON.parse(attempt.draw_json) }, storedAnswers(attempt), Number(c.env.PMES_PASS_MARK) || 16);
  const passed = attempt.passed === 1;
  const limit = await attemptLimit(c.env.PMES_DB, attempt.session_id, attempt.id_type, attempt.id_number, Number(c.env.PMES_MAX_ATTEMPTS) || 3);
  const retakesLeft = passed ? 0 : Math.max(0, limit - attempt.attempt_no);
  const certificate = await c.env.PMES_DB.prepare('SELECT no, key FROM pmes_certificates WHERE attempt_id = ?')
    .bind(attempt.id).first<{ no: string; key: string }>();
  return {
    ...result, score: attempt.score ?? result.score, passed,
    certificateNo: certificate?.no ?? null, certificateKey: certificate?.key ?? null, retakesLeft,
    ...(!passed && retakesLeft === 0 ? { message: NO_RETAKES } : {}),
  };
}

/** Wait for the current finalizer, or recover an interrupted claim after 30 seconds. */
async function waitForFinal(c: PmesContext, id: string): Promise<Final> {
  for (let retry = 0; retry < 100; retry++) {
    const attempt = await loadAttempt(c.env.PMES_DB, id);
    if (!attempt) throw new HTTPException(404, { res: c.json({ error: 'unknown-attempt' }, 404) });
    if (attempt.status !== 'submitting') return finalResult(c, attempt);
    if (attempt.submitted_at && Date.now() - Date.parse(attempt.submitted_at) > 30_000) {
      return finalize(c, attempt, storedAnswers(attempt), new Date().toISOString());
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  // A fresh claim may still be running; clients can retry until it completes or expires.
  throw new HTTPException(503, { res: c.json({ error: 'attempt-finalizing' }, 503, { 'Retry-After': '1' }) });
}

async function finalize(c: PmesContext, attempt: TimedAttempt, answers: (number | null)[], nowIso: string): Promise<Final> {
  const db = c.env.PMES_DB;
  const draw: Draw = { items: JSON.parse(attempt.draw_json) };
  const result = scoreAttempt(fullBank(), draw, answers, Number(c.env.PMES_PASS_MARK) || 16);
  if (attempt.status === 'submitting') {
    // Recovery completes the stored decision, even if configuration changed since the claim.
    result.score = attempt.score ?? result.score;
    result.passed = attempt.passed === 1;
  }
  // Claim AND store the score atomically; only the winner may perform external side effects.
  const claim = attempt.status === 'submitting'
    ? await db.prepare(`UPDATE pmes_attempts SET submitted_at = ?
        WHERE id = ? AND status = 'submitting' AND submitted_at = ?`)
      .bind(nowIso, attempt.id, attempt.submitted_at).run()
    : await db.prepare(`UPDATE pmes_attempts
    SET status = 'submitting', answers_json = ?, score = ?, passed = ?, submitted_at = ?
    WHERE id = ? AND current_n = ? AND status = 'started'`)
    .bind(JSON.stringify(answers), result.score, result.passed ? 1 : 0, nowIso, attempt.id, draw.items.length + 1).run();
  if (!claim.meta.changes) return waitForFinal(c, attempt.id);

  let certificate: { no: string; key: string } | null = null;
  try {
    certificate = result.passed ? await issueCertificate(db, attempt.id, nowIso) : null;
  } finally {
    // Keep a scored attempt recoverable by the existing admin resend route if issuance fails.
    // Publish the final result only after the certificate is available to competing requests.
    await db.prepare("UPDATE pmes_attempts SET status = 'submitted' WHERE id = ? AND current_n = ? AND status = 'submitting' AND submitted_at = ?")
      .bind(attempt.id, draw.items.length + 1, nowIso).run();
  }
  const final = await finalResult(c, { ...attempt, answers_json: JSON.stringify(answers), score: result.score, passed: result.passed ? 1 : 0 });
  const emailStatus = await sendResultEmails(c.env, attempt, final, certificate);
  if (certificate) await db.prepare('UPDATE pmes_certificates SET email_status = ? WHERE no = ?').bind(emailStatus, certificate.no).run();
  return final;
}

export async function currentState(c: PmesContext, id: string, answer?: Answer): Promise<(Step | Final) & { stale?: true }> {
  let stale = false;
  let input = answer;
  for (;;) {
    const attempt = await loadAttempt(c.env.PMES_DB, id);
    if (!attempt) throw new HTTPException(404, { res: c.json({ error: 'unknown-attempt' }, 404) });
    if (attempt.status !== 'started') {
      const result = attempt.status === 'submitting' ? await waitForFinal(c, id) : await finalResult(c, attempt);
      return { ...result, ...(answer ? { stale: true as const } : {}) };
    }
    const nowMs = Date.now();
    const draw: Draw = { items: JSON.parse(attempt.draw_json) };
    const total = draw.items.length;
    // started_at also gives pre-migration attempts a bounded, server-owned clock.
    const next = advance(storedAnswers(attempt), attempt.current_n, Date.parse(attempt.served_at ?? attempt.started_at), nowMs, total);
    if (input) {
      if (input.n !== next.currentN || next.currentN > total) stale = true;
      else {
        const choice = input.choice;
        next.answers[next.currentN - 1] = typeof choice === 'number' && Number.isInteger(choice) && choice >= 0 && choice <= 3 ? choice : null;
        next.currentN++;
        next.servedAtMs = nowMs;
      }
    }
    if (next.currentN !== attempt.current_n) {
      const update = await c.env.PMES_DB.prepare(`UPDATE pmes_attempts SET answers_json = ?, current_n = ?, served_at = ?
        WHERE id = ? AND current_n = ? AND status = 'started'`)
        .bind(JSON.stringify(next.answers), next.currentN, new Date(next.servedAtMs).toISOString(), id, attempt.current_n).run();
      if (!update.meta.changes) {
        // Never reapply the submitted answer after losing a race. Reload and only expire elapsed time.
        stale = Boolean(answer);
        input = undefined;
        continue;
      }
    }
    const result: Step | Final = next.currentN > total
      ? await finalize(c, attempt, next.answers, new Date(nowMs).toISOString())
      : {
          attemptId: id, fullName: attempt.full_name, total,
          question: presentDraw(fullBank(), draw)[next.currentN - 1],
          secondsLeft: Math.max(0, Math.ceil((next.servedAtMs + QUESTION_SECONDS * 1000 - nowMs) / 1000)),
        };
    return { ...result, ...(stale ? { stale: true as const } : {}) };
  }
}

for (const path of ['/answer', '/resume'] as const) {
  submit.post(path, async c => {
    const raw = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!raw || typeof raw.attemptId !== 'string' || !raw.attemptId ||
      (path === '/answer' && (!Number.isInteger(raw.n) || (raw.n as number) < 1))) return c.json({ error: 'missing-fields' }, 400);
    return c.json(await currentState(c, raw.attemptId, path === '/answer' ? { n: raw.n, choice: raw.choice } : undefined));
  });
}

/** Certificate numbers are sequential, so the public lookups are rate limited per IP. */
async function lookupAllowed(c: { env: PmesEnv; req: { header(n: string): string | undefined } }): Promise<boolean> {
  const { success } = await c.env.PMES_RL.limit({ key: `lookup:${c.req.header('cf-connecting-ip') ?? 'unknown'}` });
  return success;
}

submit.get('/certificate', async c => {
  if (!(await lookupAllowed(c))) return c.json({ error: 'rate-limited' }, 429);
  const { no, key } = c.req.query();
  if (!no || !key) return c.json({ error: 'missing-fields' }, 400);
  const record = await getCertificate(c.env.PMES_DB, no, key, c.env.SITE_URL);
  return record ? c.json(record) : c.json({ error: 'not-found' }, 404);
});

submit.get('/verify', async c => {
  if (!(await lookupAllowed(c))) return c.json({ error: 'rate-limited' }, 429);
  const no = c.req.query('no');
  if (!no) return c.json({ error: 'missing-fields' }, 400);
  const record = await getVerification(c.env.PMES_DB, no);
  return record ? c.json(record) : c.json({ error: 'not-found' }, 404);
});
