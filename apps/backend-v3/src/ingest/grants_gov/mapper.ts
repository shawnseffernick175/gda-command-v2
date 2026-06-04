/**
 * Grants.gov opportunity -> ExternalOpportunityRow mapper.
 * Converts GrantsGovRaw records to opportunity DB rows + per-field
 * source citations. Follows R1: every data point has a searchable source.
 */

import type { GrantsGovRaw } from './types.js';
import type { ExternalOpportunityRow, SourceCitation } from '../framework/source_writer.js';

function trimOrNull(val: string | null | undefined): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function numOrNull(val: number | null | undefined): number | null {
  if (val === undefined || val === null || val === 0) return null;
  return val;
}

/**
 * Parse Grants.gov MM/DD/YYYY date string to ISO timestamp (noon UTC).
 */
function parseDateMMDDYYYY(val: string | null | undefined): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '') return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!match) return null;
  return `${match[3]}-${match[1]}-${match[2]}T12:00:00Z`;
}

/**
 * Parse Grants.gov MM/DD/YYYY date string to ISO date (YYYY-MM-DD).
 */
function parseDateToISO(val: string | null | undefined): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '') return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!match) return null;
  return `${match[3]}-${match[1]}-${match[2]}`;
}

function buildGrantsGovUrl(opportunityId: string): string {
  return `https://www.grants.gov/search-results-detail/${opportunityId}`;
}

export function mapGrantsGovOpp(
  raw: GrantsGovRaw,
): { opportunity: ExternalOpportunityRow; citations: SourceCitation[] } | null {
  const id = trimOrNull(raw.id);
  if (!id) return null;

  const sourceUrl = buildGrantsGovUrl(id);

  const opportunity: ExternalOpportunityRow = {
    external_id: id,
    title: trimOrNull(raw.title) ?? 'Untitled',
    agency: trimOrNull(raw.agencyName),
    sub_agency: null,
    department: trimOrNull(raw.agencyName),
    solicitation_number: trimOrNull(raw.number),
    status: 'discovery',
    value_min: numOrNull(raw.awardFloor),
    value_max: numOrNull(raw.awardCeiling),
    naics: null,
    psc: null,
    set_aside: null,
    place_of_performance: null,
    response_due_at: parseDateMMDDYYYY(raw.closeDate),
    posted_at: parseDateToISO(raw.openDate),
    description: trimOrNull(raw.description),
    data_source: 'grants_gov',
    tags: ['fast_track', 'signal', 'grants', 'grants.gov'],
    agency_subtype: null,
    opportunity_type: 'grant',
    part_number: trimOrNull(raw.cfda),
    quantity: null,
  };

  const citations: SourceCitation[] = [];

  if (opportunity.title) {
    citations.push({ field: 'title', source_url: sourceUrl });
  }
  if (opportunity.agency) {
    citations.push({ field: 'agency', source_url: sourceUrl });
  }
  if (opportunity.posted_at) {
    citations.push({ field: 'posted_at', source_url: sourceUrl });
  }
  if (opportunity.response_due_at) {
    citations.push({ field: 'response_due_at', source_url: sourceUrl });
  }
  if (opportunity.value_min !== null) {
    citations.push({ field: 'value_min', source_url: sourceUrl });
  }
  if (opportunity.value_max !== null) {
    citations.push({ field: 'value_max', source_url: sourceUrl });
  }

  return { opportunity, citations };
}
