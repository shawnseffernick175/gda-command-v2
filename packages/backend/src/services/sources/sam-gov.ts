/**
 * SAM.gov source URL builder.
 * Builds a citable URL from a SAM.gov notice ID.
 */

const SAM_BASE = "https://sam.gov/opp";

export function samGovUrl(noticeId: string): string {
  return `${SAM_BASE}/${encodeURIComponent(noticeId)}/view`;
}

export function samGovSearchUrl(keyword: string): string {
  return `https://sam.gov/search/?keywords=${encodeURIComponent(keyword)}&sort=-relevance&index=opp`;
}
