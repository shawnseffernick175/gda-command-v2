/**
 * Derive a human-readable source label from a URL's host.
 *
 * Avoids hardcoding "SAM.gov" on chips whose underlying link may point at a
 * different government data source (GovTribe, USAspending, FPDS, etc.). When
 * the host is unrecognized we fall back to the bare hostname so the chip still
 * tells the truth about where the link goes (honors R1: every data point names
 * its real source).
 */

const HOST_LABELS: Array<{ match: RegExp; label: string }> = [
  { match: /(^|\.)sam\.gov$/i, label: "SAM.gov" },
  { match: /(^|\.)govtribe\.com$/i, label: "GovTribe" },
  { match: /(^|\.)usaspending\.gov$/i, label: "USAspending" },
  { match: /(^|\.)fpds\.gov$/i, label: "FPDS" },
  { match: /(^|\.)govwin\.com$/i, label: "GovWin" },
  { match: /(^|\.)gsa\.gov$/i, label: "GSA" },
  { match: /(^|\.)beta\.sam\.gov$/i, label: "SAM.gov" },
  { match: /(^|\.)highergov\.com$/i, label: "HigherGov" },
];

/**
 * Returns a friendly label for the source URL.
 * @param url    The source URL (may be null/undefined).
 * @param fallback Label to use when no URL is present (default "Source").
 */
export function sourceLabelFromUrl(
  url: string | null | undefined,
  fallback = "Source",
): string {
  if (!url) return fallback;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return fallback;
  }
  for (const { match, label } of HOST_LABELS) {
    if (match.test(host)) return label;
  }
  // Unknown host: strip a leading "www." and return the bare domain.
  return host.replace(/^www\./i, "");
}
