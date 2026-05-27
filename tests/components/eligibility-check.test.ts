import { describe, it, expect } from 'vitest';
import { evaluateEligibility } from '~/components/eligibility-logic';

describe('evaluateEligibility', () => {
  it('returns "regular" when applicant is an ISAT U regular employee', () => {
    expect(evaluateEligibility({ isatEmployee: 'yes', familyOrAlumni: 'no', residingInIloilo: 'yes' })).toBe('regular');
  });
  it('returns "associate" when applicant is alumni or family of regular member', () => {
    expect(evaluateEligibility({ isatEmployee: 'no', familyOrAlumni: 'yes', residingInIloilo: 'yes' })).toBe('associate');
  });
  it('returns "ineligible" when not connected to ISAT U and not residing in Iloilo', () => {
    expect(evaluateEligibility({ isatEmployee: 'no', familyOrAlumni: 'no', residingInIloilo: 'no' })).toBe('ineligible');
  });
  it('returns "review" when residing in Iloilo but no ISAT U connection', () => {
    expect(evaluateEligibility({ isatEmployee: 'no', familyOrAlumni: 'no', residingInIloilo: 'yes' })).toBe('review');
  });
});
