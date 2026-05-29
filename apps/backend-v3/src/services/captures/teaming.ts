/**
 * Teaming worksheet validation.
 *
 * Envision-side scope: partners must be recognized Envision-side partner names.
 * No partner OUs as primes.
 */

const ENVISION_PARTNERS = new Set([
  'riverstone',
  'pd systems',
  'pd-systems',
  'pdsystems',
  'riverstone solutions',
]);

export interface TeamingWorksheet {
  partners: string[];
  rationale: string;
}

export interface TeamingValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTeamingWorksheet(
  worksheet: TeamingWorksheet
): TeamingValidationResult {
  const errors: string[] = [];

  if (worksheet.partners.length > 0 && (!worksheet.rationale || worksheet.rationale.trim().length === 0)) {
    errors.push('Rationale is required when partners are specified');
  }

  for (const partner of worksheet.partners) {
    if (!ENVISION_PARTNERS.has(partner.toLowerCase())) {
      errors.push(`Partner '${partner}' is not a recognized Envision-side partner`);
    }
  }

  return { valid: errors.length === 0, errors };
}
