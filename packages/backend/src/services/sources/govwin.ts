/**
 * GovWin IQ source URL builder.
 * Builds a citable URL from a GovWin record ID.
 */

const GOVWIN_BASE = "https://iq.govwin.com/neo/opportunity/view";

export function govwinUrl(gwId: string): string {
  return `${GOVWIN_BASE}/${encodeURIComponent(gwId)}`;
}
