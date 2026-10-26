// Named import only: the default export would bundle the whole bank (answers included) into the attendee page.
import { sections } from '~/data/pmes-questions.json';

export type Question = { n: number; id: string; section: string; text: string; options: string[] };
export type StartRequest = {
  code: string; idType: 'application'; idNumber: string; mobile: string; consent: true; turnstile: string;
} | {
  code: string; idType: 'member'; idNumber: string; fullName: string; mobile: string; email: string; consent: true; turnstile: string;
};
export type Step = { attemptId: string; fullName: string; total: number; question: Question; secondsLeft: number; stale?: true };
export type StartResponse = Step & { attemptNo: number };
export type Missed = { n: number; text: string; yourAnswer: string | null; correctAnswer: string; slide: number };
export type Final = {
  score: number; total: number; passed: boolean; reviewSections: string[]; missed: Missed[];
  certificateNo: string | null; certificateKey: string | null; retakesLeft: number; message?: string; stale?: true;
};
export type AnswerRequest = { attemptId: string; n: number; choice: number | null };
export type ResumeRequest = { attemptId: string };
export type QuizResponse = Step | Final;

export function deadlineFromStep(step: Step, nowMs: number): number {
  return nowMs + Math.max(0, step.secondsLeft) * 1000;
}
export function isStep(r: QuizResponse): r is Step { return 'question' in r; }
export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

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
  'unknown-application': 'That application number and mobile number do not match our records. Use the number on your application form and the mobile number you gave.',
  'consent-required': 'Please tick the data privacy consent to continue.',
  'turnstile-failed': 'The security check did not pass. Please try again.',
  'bank-not-ready': 'The quiz is not open yet. Please see the presenter.',
  'forbidden': 'This page must be opened from the cooperative website.',
  'rate-limited': 'Too many attempts from this connection. Please wait a few minutes and try again.',
  'attempt-in-progress': 'A quiz for this number is already in progress on another phone or browser. Continue it there, or see the presenter.',
  'unknown-attempt': 'This attempt is no longer recognized. Please start again.',
  'attempt-finalizing': 'Your result is being prepared. Please try again in a moment.',
  'generic': 'Something went wrong. Please check your connection and try again.',
};
export function errorMessage(code: string): string { return ERRORS[code] ?? ERRORS['generic']!; }

export function renderResult(r: Final): {
  headline: string; detail: string; reviewLines: string[];
  missedLines: { question: string; yours: string; correct: string; slide: number }[];
} {
  const reviewLines = r.reviewSections.map(sectionTitle);
  const missedLines = r.missed.map(m => ({
    question: m.text, yours: m.yourAnswer ?? 'No answer (time ran out)', correct: m.correctAnswer, slide: m.slide,
  }));
  if (r.passed) return {
    headline: `You passed with ${r.score} of ${r.total}. Certificate ${r.certificateNo}.`,
    detail: 'Your result and certificate link have also been sent to your email.', reviewLines, missedLines,
  };
  const retakes = `${r.retakesLeft} ${r.retakesLeft === 1 ? 'retake' : 'retakes'} left`;
  return {
    headline: `Not yet: ${r.score} of ${r.total}. ${retakes}.`,
    detail: r.retakesLeft > 0
      ? 'The pass mark is 16 of 20. Review the sections below, then take the quiz again. Each retake is a fresh set of questions.'
      : (r.message ?? 'The pass mark is 16 of 20.'),
    reviewLines, missedLines,
  };
}
