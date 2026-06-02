/**
 * DoD RSS item -> ExternalOpportunityRow mapper.
 * Converts DoDRSSItemRaw records to opportunity DB rows + per-field
 * source citations. Follows R1: every data point has a searchable source.
 */

import type { DoDRSSItemRaw } from './types.js';
import type { ExternalOpportunityRow, SourceCitation } from '../framework/source_writer.js';

function trimOrNull(val: string | undefined): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

/**
 * Extract the numeric article id from a war.gov URL path.
 * Pattern: /Article/<digits>/
 */
function extractArticleId(url: string): string | null {
  const m = /\/Article\/(\d+)\//i.exec(url);
  return m ? m[1] : null;
}

/**
 * Parse RFC822 pubDate to ISO YYYY-MM-DD.
 */
function parseRFC822Date(val: string | undefined): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '') return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function mapDoDRSSItem(
  raw: DoDRSSItemRaw,
): { opportunity: ExternalOpportunityRow; citations: SourceCitation[] } | null {
  const link = trimOrNull(raw.link);
  const guid = trimOrNull(raw.guid);

  if (!link && !guid) return null;

  const sourceUrl = link ?? guid!;
  const externalId = extractArticleId(sourceUrl) ?? sourceUrl;
  const postedAt = parseRFC822Date(raw.pubDate);

  const opportunity: ExternalOpportunityRow = {
    external_id: externalId,
    title: trimOrNull(raw.title) ?? 'DoD Contract Announcements',
    agency: 'Department of War',
    sub_agency: null,
    department: 'Department of War',
    solicitation_number: null,
    status: 'discovery',
    value_min: null,
    value_max: null,
    naics: null,
    psc: null,
    set_aside: null,
    place_of_performance: null,
    response_due_at: null,
    posted_at: postedAt,
    description: trimOrNull(raw.description) ?? null,
    data_source: 'dod_rss',
    tags: ['fast_track', 'signal', 'dod_rss', 'contract_award'],
    agency_subtype: null,
    opportunity_type: 'contract_award',
    part_number: null,
    quantity: null,
  };

  const citations: SourceCitation[] = [
    { field: 'title', source_url: sourceUrl },
    { field: 'agency', source_url: sourceUrl },
  ];

  if (postedAt) {
    citations.push({ field: 'posted_at', source_url: sourceUrl });
  }

  return { opportunity, citations };
}
