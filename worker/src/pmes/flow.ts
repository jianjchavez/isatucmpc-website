import type { PresentedQuestion } from './draw';

export const QUESTION_SECONDS = 30;
export const ANSWER_GRACE_MS = 5000;

export type Step = { attemptId: string; fullName: string; total: number; question: PresentedQuestion; secondsLeft: number };
export type Missed = { n: number; text: string; yourAnswer: string | null; correctAnswer: string; slide: number };
export type Final = {
  score: number; total: number; passed: boolean; reviewSections: string[]; missed: Missed[];
  certificateNo: string | null; certificateKey: string | null; retakesLeft: number; message?: string;
};

/** Expiry preserves the original schedule, including time spent with the tab closed. */
export function advance(answers: (number | null)[], currentN: number, servedAtMs: number, nowMs: number, total: number) {
  const nextAnswers = [...answers];
  while (currentN <= total && nowMs > servedAtMs + QUESTION_SECONDS * 1000 + ANSWER_GRACE_MS) {
    nextAnswers[currentN - 1] = null;
    servedAtMs += QUESTION_SECONDS * 1000;
    currentN++;
  }
  return { answers: nextAnswers, currentN, servedAtMs };
}
