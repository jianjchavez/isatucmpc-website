import data from '../../../src/data/pmes-questions.json';

export type Section = { id: string; title: string };
export type Question = {
  id: string;
  section: string;
  slide: number;
  text: string;
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  source: string;
  status: string;
};
export type Bank = { sections: Section[]; questions: Question[] };

export function loadBank(status: 'approved' | 'draft'): Bank {
  const questions = (data.questions as Question[]).filter(q => q.status === status);
  return { sections: data.sections, questions };
}
