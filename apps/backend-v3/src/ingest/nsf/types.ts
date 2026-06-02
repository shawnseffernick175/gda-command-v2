/**
 * Raw NSF award record shape returned by the NSF Awards API.
 * All fields are string-typed (the API returns strings); optional
 * because the API omits empty fields.
 */

export interface NSFAwardRaw {
  id?: string;
  title?: string;
  abstractText?: string;
  awardeeName?: string;
  awardeeStateCode?: string;
  estimatedTotalAmt?: string;
  fundsObligatedAmt?: string;
  pdPIName?: string;
  startDate?: string;
  expDate?: string;
  fundProgramName?: string;
  agency?: string;
  date?: string;
  awardAgencyCode?: string;
  primaryProgram?: string;
}
