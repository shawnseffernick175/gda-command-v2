/**
 * NSF award -> ExternalOpportunityRow mapper.
 * Converts NSFAwardRaw records to opportunity DB rows + per-field
 * source citations. Follows R1: every data point has a searchable source.
 */

import type { NSFAwardRaw } from './types.js';
import type { ExternalOpportunityRow, SourceCitation } from '../framework/source_writer.js';

function trimOrNull(val: string | undefined): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function numOrNull(val: string | undefined): number | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim().replace(/[,$]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/**
 * Parse NSF MM/DD/YYYY date string to ISO YYYY-MM-DD.
 */
function parseDateMMDDYYYY(val: string | undefined): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '') return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!match) return null;
  return `${match[3]}-${match[1]}-${match[2]}`;
}

function buildNSFAwardUrl(id: string): string {
  return `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${id}`;
}

export function mapNSFAward(
  raw: NSFAwardRaw,
): { opportunity: ExternalOpportunityRow; citations: SourceCitation[] } | null {
  const id = trimOrNull(raw.id);
  if (!id) return null;

  const sourceUrl = buildNSFAwardUrl(id);

  const dollarAmount = numOrNull(raw.estimatedTotalAmt) ?? numOrNull(raw.fundsObligatedAmt);

  const opportunity: ExternalOpportunityRow = {
    external_id: id,
    title: trimOrNull(raw.title) ?? 'Untitled',
    agency: trimOrNull(raw.agency) ?? 'National Science Foundation',
    sub_agency: trimOrNull(raw.primaryProgram) ?? trimOrNull(raw.fundProgramName) ?? null,
    department: 'National Science Foundation',
    solicitation_number: null,
    status: 'discovery',
    value_min: dollarAmount,
    value_max: dollarAmount,
    naics: null,
    psc: null,
    set_aside: null,
    place_of_performance: trimOrNull(raw.awardeeStateCode) ?? null,
    response_due_at: null,
    posted_at: parseDateMMDDYYYY(raw.startDate),
    description: trimOrNull(raw.abstractText) ?? null,
    data_source: 'nsf',
    tags: ['fast_track', 'signal', 'nsf', 'research'],
    agency_subtype: trimOrNull(raw.fundProgramName) ?? null,
    opportunity_type: 'research_award',
    part_number: null,
    quantity: null,
  };

  const citations: SourceCitation[] = [];

  // R1: emit citations for populated fields that have FIELD_TO_TABLE entries
  // in source_writer.ts: title, agency, naics, response_due_at, posted_at,
  // value_min, value_max
  if (opportunity.title) {
    citations.push({ field: 'title', source_url: sourceUrl });
  }
  if (opportunity.agency) {
    citations.push({ field: 'agency', source_url: sourceUrl });
  }
  if (opportunity.posted_at) {
    citations.push({ field: 'posted_at', source_url: sourceUrl });
  }
  if (opportunity.value_min !== null) {
    citations.push({ field: 'value_min', source_url: sourceUrl });
  }
  if (opportunity.value_max !== null) {
    citations.push({ field: 'value_max', source_url: sourceUrl });
  }

  return { opportunity, citations };
}
