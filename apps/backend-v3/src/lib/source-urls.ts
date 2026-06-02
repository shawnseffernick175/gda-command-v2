/**
 * F-420a (R1): deterministic public-URL + SourceKind resolution for the
 * internal source identifiers used by the merge/link layer.
 *
 * The unified merge layer uses short internal source names
 * ('sam' | 'govwin' | 'govtribe' | 'fast_track'). The R1 SourceRef contract
 * (src/lib/sources.ts) uses the canonical SourceKind enum. This module maps
 * between them and builds a stable public URL from a source + native id so
 * the unified detail page can render clickable provenance links.
 */

import { makeSourceRef, type SourceKind, type SourceRef } from './sources.js';

/** Map an internal merge-layer source name to a canonical SourceKind. */
export function sourceKindOf(source: string): SourceKind {
  switch (source) {
    case 'sam':
      return 'sam_gov';
    case 'govwin':
      return 'govwin';
    case 'govtribe':
      return 'govtribe';
    case 'fast_track':
      return 'internal';
    default:
      return 'internal';
  }
}

/** Human label for a source, used as the SourceRef title. */
export function sourceLabelOf(source: string): string {
  switch (source) {
    case 'sam':
      return 'SAM.gov';
    case 'govwin':
      return 'GovWin IQ';
    case 'govtribe':
      return 'GovTribe';
    case 'fast_track':
      return 'GDA Fast Track';
    default:
      return source;
  }
}

/**
 * Build a stable public URL for a source record. Returns null for sources
 * that have no externally addressable page (e.g. Fast Track is internal).
 */
export function buildSourceUrl(source: string, nativeId: string): string | null {
  const id = encodeURIComponent(nativeId);
  switch (source) {
    case 'sam':
      return `https://sam.gov/opp/${id}/view`;
    case 'govtribe':
      return `https://govtribe.com/opportunity/federal-contract-opportunity/${id}`;
    case 'govwin':
      return `https://iq.govwin.com/neo/opportunity/view/${id}`;
    case 'fast_track':
      return null;
    default:
      return null;
  }
}

/**
 * Build the SourceRef[] for a single merged field, given the winning source
 * name and the link rows. Resolves the native id from the matching link.
 * Returns [] when the source is null/unknown or has no addressable URL.
 */
export function buildFieldSourceRefs(
  source: string | null,
  links: Array<{ source: string; source_native_id: string }>,
  retrievedAt?: Date,
): SourceRef[] {
  if (!source) return [];
  const link = links.find((l) => l.source === source);
  if (!link) return [];
  const url = buildSourceUrl(source, link.source_native_id);
  if (!url) return [];
  return [makeSourceRef(sourceKindOf(source), sourceLabelOf(source), url, retrievedAt)];
}
