/**
 * USAspending source URL builder.
 * Builds a citable URL from an award ID.
 */

const USA_BASE = "https://www.usaspending.gov/award";

export function usaspendingUrl(awardId: string): string {
  return `${USA_BASE}/${encodeURIComponent(awardId)}`;
}
