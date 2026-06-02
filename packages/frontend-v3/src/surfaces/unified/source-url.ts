import type { SourceRef } from './types';

/**
 * F-422: build a clickable provenance URL for a source record (R1).
 *
 * The F-412 suggestion-queue endpoint returns a link's `source` +
 * `source_native_id` but not a pre-built URL (unlike the F-410 detail
 * endpoint, which supplies `sources[]` directly). To keep every suggestion's
 * source clickable, we reconstruct the same canonical URLs the backend's
 * `apps/backend-v3/src/lib/source-urls.ts` produces. Sources with no public,
 * addressable page (e.g. Fast Track signals) return null and render as plain
 * text via SourceLink's fallback.
 */
export function buildSourceUrl(
  source: string,
  nativeId: string,
): string | null {
  const id = encodeURIComponent(nativeId);
  switch (source) {
    case 'sam':
      return `https://sam.gov/opp/${id}/view`;
    case 'govtribe':
      return `https://govtribe.com/opportunity/federal-contract-opportunity/${id}`;
    case 'govwin':
      return `https://iq.govwin.com/neo/opportunity/view/${id}`;
    default:
      // fast_track and any unknown source have no addressable public page.
      return null;
  }
}

const SOURCE_LABELS: Record<string, string> = {
  sam: 'SAM.gov',
  govtribe: 'GovTribe',
  govwin: 'GovWin',
  fast_track: 'Fast Track',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/**
 * Build the R1 SourceRef array for a suggestion's source record. Returns an
 * empty array when the source has no addressable URL, which SourceLink renders
 * as plain text.
 */
export function suggestionSourceRefs(
  source: string,
  nativeId: string,
  retrievedAt?: string | null,
): SourceRef[] {
  const url = buildSourceUrl(source, nativeId);
  if (!url) return [];
  return [
    {
      kind: source,
      title: sourceLabel(source),
      url,
      retrieved_at: retrievedAt ?? new Date().toISOString(),
    },
  ];
}
