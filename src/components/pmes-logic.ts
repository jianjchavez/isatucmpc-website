// Named import only: the default export would bundle the whole bank (answers included) into the attendee page.
import { sections } from '~/data/pmes-questions.json';

// ---- API shapes (spec §5) ----
export type Question = { n: number; id: string; section: string; text: string; options: string[] };
export type StartRequest = {
  code: string; idType: 'application' | 'member'; idNumber: string; fullName: string;
  mobile: string; email: string; consent: true; turnstile: string;
};
export type StartResponse = { attemptId: string; attemptNo: number; deadlineAt: string | null; questions: Question[] };
export type SubmitRequest = { attemptId?: string; answers: { n: number; choice: number | null }[] };
export type SubmitResponse = {
  score: number; total: number; passed: boolean; reviewSections: string[];
  certificateNo: string | null; certificateKey: string | null; retakesLeft: number; message?: string;
};

// ---- quiz state (immutable updates) ----
export type QuizState = {
  attemptId?: string;
  questions: Question[];
  answers: Record<number, number>; // n -> option index
  deadlineMs: number | null;
  unanswered: number;
};

export function createQuizState(questions: Question[], deadlineAt: string | null, attemptId?: string): QuizState {
  const sorted = [...questions].sort((a, b) => a.n - b.n);
  return { attemptId, questions: sorted, answers: {}, deadlineMs: deadlineAt ? Date.parse(deadlineAt) : null, unanswered: sorted.length };
}

export function answer(state: QuizState, n: number, choice: number): QuizState {
  const answers = { ...state.answers, [n]: choice };
  return { ...state, answers, unanswered: state.questions.filter(q => answers[q.n] === undefined).length };
}

export function remainingSeconds(state: QuizState, nowMs: number): number | null {
  if (state.deadlineMs === null) return null;
  return Math.max(0, Math.ceil((state.deadlineMs - nowMs) / 1000));
}

export function isExpired(state: QuizState, nowMs: number): boolean {
  return state.deadlineMs !== null && nowMs >= state.deadlineMs;
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function toSubmitPayload(state: QuizState): SubmitRequest {
  return { attemptId: state.attemptId, answers: state.questions.map(q => ({ n: q.n, choice: state.answers[q.n] ?? null })) };
}

// ---- lookups ----
const TITLES: Record<string, string> = Object.fromEntries(sections.map(s => [s.id, s.title]));
export function sectionTitle(id: string): string { return TITLES[id] ?? id; }

const ERRORS: Record<string, string> = {
  'invalid-code': 'That session code is not recognized. Check it with the presenter and try again.',
  'session-closed': 'This session has been closed by the presenter.',
  'code-expired': 'This session code has expired. It was valid only on the session date.',
  'attempts-exhausted': 'You have used all your attempts for this session. Please see the Education and Training Committee. The presenter can allow another attempt.',
  'already-passed': 'You have already passed the quiz for this session. Check your email for your certificate.',
  'missing-fields': 'Please fill in all the fields.',
  'invalid-mobile': 'Enter a Philippine mobile number: 11 digits starting with 09.',
  'invalid-email': 'Enter a valid email address.',
  'consent-required': 'Please tick the data privacy consent to continue.',
  'turnstile-failed': 'The security check did not pass. Please try again.',
  'bank-not-ready': 'The quiz is not open yet. Please see the presenter.',
  'forbidden': 'This page must be opened from the cooperative website.',
  'rate-limited': 'Too many attempts from this connection. Please wait a few minutes and try again.',
  'unknown-attempt': 'This attempt is no longer recognized. Please start again.',
  'already-submitted': 'This attempt was already submitted.',
  'expired': 'Time ran out before your answers reached us. This attempt counts with a score of 0. If you have retakes left, you may start again.',
  'generic': 'Something went wrong. Please check your connection and try again.',
};
export function errorMessage(code: string): string { return ERRORS[code] ?? ERRORS['generic']!; }

// ---- result screen ----
export function renderResult(r: SubmitResponse): { headline: string; detail: string; reviewLines: string[] } {
  const reviewLines = r.reviewSections.map(sectionTitle);
  if (r.passed) {
    return {
      headline: `You passed with ${r.score} of ${r.total}. Certificate ${r.certificateNo}.`,
      detail: 'Your result and certificate link have also been sent to your email.',
      reviewLines,
    };
  }
  const retakes = `${r.retakesLeft} ${r.retakesLeft === 1 ? 'retake' : 'retakes'} left`;
  return {
    headline: `Not yet: ${r.score} of ${r.total}. ${retakes}.`,
    detail: r.retakesLeft > 0
      ? 'The pass mark is 16 of 20. Review the sections below, then take the quiz again. Each retake is a fresh set of questions.'
      : (r.message ?? 'The pass mark is 16 of 20.'),
    reviewLines,
  };
}
