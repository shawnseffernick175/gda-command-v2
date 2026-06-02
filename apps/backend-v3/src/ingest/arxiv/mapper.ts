/**
 * arXiv entry -> ExternalOpportunityRow mapper.
 * Converts ArxivEntryRaw records to opportunity DB rows + per-field
 * source citations. Follows R1: every data point has a searchable source.
 */

import type { ArxivEntryRaw } from './types.js';
import type { ExternalOpportunityRow, SourceCitation } from '../framework/source_writer.js';

function trimOrNull(val: string | undefined | null): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function parseISODate(val: string | undefined | null): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '' || s.length < 10) return null;
  const datePart = s.slice(0, 10);
  if (isNaN(new Date(datePart).getTime())) return null;
  return datePart;
}

export function mapArxivEntry(
  raw: ArxivEntryRaw,
): { opportunity: ExternalOpportunityRow; citations: SourceCitation[] } | null {
  if (!raw.arxivId) return null;

  const externalId = raw.arxivId;
  const sourceUrl = raw.absUrl;

  const postedAt = parseISODate(raw.published);

  const opportunity: ExternalOpportunityRow = {
    external_id: externalId,
    title: trimOrNull(raw.title) ?? 'Untitled arXiv Paper',
    agency: 'arXiv',
    sub_agency: raw.primaryCategory ?? null,
    department: 'arXiv',
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
    description: trimOrNull(raw.summary) ?? null,
    data_source: 'arxiv',
    tags: ['fast_track', 'signal', 'arxiv', 'arxiv_paper'],
    agency_subtype: raw.primaryCategory ?? null,
    opportunity_type: 'arxiv_paper',
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
