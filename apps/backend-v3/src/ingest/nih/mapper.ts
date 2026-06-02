/**
 * NIH RePORTER project -> ExternalOpportunityRow mapper.
 * Converts NIHProjectRaw records to opportunity DB rows + per-field
 * source citations. Follows R1: every data point has a searchable source.
 */

import type { NIHProjectRaw } from './types.js';
import type { ExternalOpportunityRow, SourceCitation } from '../framework/source_writer.js';

function trimOrNull(val: string | undefined | null): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

/**
 * Parse ISO date string (e.g. "2006-06-29T00:00:00") to YYYY-MM-DD.
 */
function parseISODate(val: string | undefined | null): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '' || s.length < 10) return null;
  const datePart = s.slice(0, 10);
  if (isNaN(new Date(datePart).getTime())) return null;
  return datePart;
}

function buildNIHProjectUrl(applId: number): string {
  return `https://reporter.nih.gov/project-details/${applId}`;
}

export function mapNIHProject(
  raw: NIHProjectRaw,
): { opportunity: ExternalOpportunityRow; citations: SourceCitation[] } | null {
  if (raw.appl_id === undefined || raw.appl_id === null) return null;

  const externalId = String(raw.appl_id);
  const sourceUrl = buildNIHProjectUrl(raw.appl_id);

  const awardAmount = raw.award_amount ?? null;
  const postedAt = parseISODate(raw.project_start_date);

  const opportunity: ExternalOpportunityRow = {
    external_id: externalId,
    title: trimOrNull(raw.project_title) ?? 'Untitled NIH Project',
    agency: raw.agency_ic_admin?.name ?? raw.agency_ic_admin?.abbreviation ?? 'National Institutes of Health',
    sub_agency: raw.agency_ic_admin?.abbreviation ?? null,
    department: 'National Institutes of Health',
    solicitation_number: trimOrNull(raw.project_num) ?? null,
    status: 'discovery',
    value_min: awardAmount,
    value_max: awardAmount,
    naics: null,
    psc: null,
    set_aside: null,
    place_of_performance: raw.organization?.org_state ?? null,
    response_due_at: null,
    posted_at: postedAt,
    description: null,
    data_source: 'nih',
    tags: ['fast_track', 'signal', 'nih', 'research_award'],
    agency_subtype: raw.activity_code ?? null,
    opportunity_type: 'research_award',
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
  if (awardAmount !== null) {
    citations.push({ field: 'value_min', source_url: sourceUrl });
    citations.push({ field: 'value_max', source_url: sourceUrl });
  }

  return { opportunity, citations };
}
