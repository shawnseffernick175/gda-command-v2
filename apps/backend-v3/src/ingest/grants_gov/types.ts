/**
 * Raw Grants.gov opportunity record shape returned by the
 * Grants.gov REST API oppHits array.
 */

export interface GrantsGovRaw {
  id: string;
  number: string;
  title: string;
  agencyCode: string;
  agencyName: string;
  openDate: string;
  closeDate: string | null;
  awardCeiling: number | null;
  awardFloor: number | null;
  description: string | null;
  oppStatus: string;
  cfda: string | null;
  category: string | null;
}
