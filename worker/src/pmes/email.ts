// Result emails (spec docs/superpowers/specs/2026-10-21-pmes-quiz-design.md §8).
import type { PmesEnv } from './env';
import { resend, escapeHtml } from '../resend';

/** A pmes_attempts row joined with session_date, code and presenter_name from pmes_sessions. */
export type AttemptRow = {
  id: string;
  session_id: number;
  attempt_no: number;
  id_type: string;
  id_number: string;
  full_name: string;
  mobile: string;
  email: string;
  consent_at: string;
  draw_json: string;
  answers_json: string | null;
  score: number | null;
  passed: number | null;
  started_at: string;
  deadline_at: string | null;
  submitted_at: string | null;
  status: string;
  session_date: string;
  code: string;
  presenter_name: string;
};

export type Result = { score: number; total: number; passed: boolean; retakesLeft: number };

const FROM = 'ISATUCMPC <noreply@isatucmpc.coop>';
const CONTACT = '<p>Office: (033) 330-2586 · isatucmpc1964@gmail.com</p>';
const ID_LABEL: Record<string, string> = { application: 'Application No.', member: 'Member No.' };

export async function sendResultEmails(
  env: PmesEnv,
  attempt: AttemptRow,
  result: Result,
  certificate: { no: string; key: string } | null,
): Promise<'sent' | 'failed'> {
  const e = escapeHtml;
  const subject = result.passed
    ? `PMES result: PASSED, Certificate ${certificate?.no ?? ''}`
    : `PMES result: ${result.score} of ${result.total}, ${result.retakesLeft > 0 ? 'retake available' : 'no retakes left'}`;

  const outcome = result.passed
    ? `<p>You passed the Pre-Membership Education Seminar certification quiz with a score of <strong>${result.score} of ${result.total}</strong>.</p>` +
      (certificate
        ? `<p>Your certificate: <a href="${e(`${env.SITE_URL}/pmes/certificate/?no=${certificate.no}&key=${certificate.key}`)}">${e(certificate.no)}</a></p>`
        : '')
    : `<p>Your score is <strong>${result.score} of ${result.total}</strong>; the pass mark is 16. ` +
      (result.retakesLeft > 0
        ? `You have ${result.retakesLeft} retake${result.retakesLeft === 1 ? '' : 's'} left with the same session code.</p>`
        : 'No retakes are left. Please see the Education and Training Committee; the presenter can allow another attempt.</p>');

  const common =
    `<p>Session: ${e(attempt.session_date)}, code ${e(attempt.code)}</p>` + outcome;

  const toAttendee = resend(env, {
    from: FROM,
    to: [attempt.email],
    subject,
    html: `<p>Dear ${e(attempt.full_name)},</p>${common}${CONTACT}<p>— ISATUCMPC</p>`,
  });
  const toCoop = resend(env, {
    from: FROM,
    to: [env.TO_EMAIL],
    reply_to: attempt.email,
    subject: `${subject} (${attempt.full_name})`,
    html:
      `<p><strong>${e(attempt.full_name)}</strong> (${e(ID_LABEL[attempt.id_type] ?? attempt.id_type)} ${e(attempt.id_number)})</p>` +
      `<p>Mobile: ${e(attempt.mobile)} · Email: ${e(attempt.email)}</p>` +
      `<p>Attempt ${attempt.attempt_no} · Presenter: ${e(attempt.presenter_name)}</p>` +
      common,
  });
  const ok = await Promise.all([toAttendee, toCoop]);
  return ok.every(Boolean) ? 'sent' : 'failed';
}
