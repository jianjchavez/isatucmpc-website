export type EligibilityAnswers = {
  isatEmployee: 'yes' | 'no';
  familyOrAlumni: 'yes' | 'no';
  residingInIloilo: 'yes' | 'no';
};
export type EligibilityResult = 'regular' | 'associate' | 'review' | 'ineligible';

export function evaluateEligibility(a: EligibilityAnswers): EligibilityResult {
  if (a.isatEmployee === 'yes') return 'regular';
  if (a.familyOrAlumni === 'yes') return 'associate';
  if (a.residingInIloilo === 'yes') return 'review';
  return 'ineligible';
}
