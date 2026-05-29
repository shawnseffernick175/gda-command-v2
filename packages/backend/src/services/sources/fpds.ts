/**
 * FPDS source URL builder.
 * Builds a citable URL from a PIID (contract number).
 */

const FPDS_BASE = "https://www.fpds.gov/ezsearch/search.do";

export function fpdsUrl(piid: string): string {
  return `${FPDS_BASE}?q=PIID%3A%22${encodeURIComponent(piid)}%22&s=FPDS.GOV&templateName=1.5.3`;
}
