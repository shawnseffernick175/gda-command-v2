/**
 * NECO record → opportunities row mapper.
 * Maps parsed NECO data to ExternalOpportunityRow + SourceCitation arrays.
 */

import type { NECORecord } from './parser.js';
import type { ExternalOpportunityRow, SourceCitation } from '../framework/source_writer.js';
import { NECO_BASE } from './client.js';

export interface MappedNECOOpportunity {
  opportunity: ExternalOpportunityRow;
  citations: SourceCitation[];
}

function buildNECOUrl(rfqNumber: string, detailUrl: string | null): string {
  if (detailUrl) {
    return detailUrl.startsWith('http') ? detailUrl : `${NECO_BASE}${detailUrl}`;
  }
  return `${NECO_BASE}/synopsis/search.aspx?rfq=${encodeURIComponent(rfqNumber)}`;
}

export function mapNECORecord(raw: NECORecord): MappedNECOOpportunity {
  const sourceUrl = buildNECOUrl(raw.rfqNumber, raw.detailUrl);

  const opportunity: ExternalOpportunityRow = {
    external_id: raw.rfqNumber,
    title: raw.title || `NECO Synopsis ${raw.rfqNumber}`,
    agency: 'Department of the Navy',
    sub_agency: raw.issuingActivity ?? null,
    department: 'Navy',
    solicitation_number: raw.rfqNumber,
    status: 'discovery',
    value_min: null,
    value_max: null,
    naics: raw.naics ?? null,
    psc: null,
    set_aside: raw.setAside ?? null,
    place_of_performance: null,
    response_due_at: raw.closingDate ?? null,
    posted_at: raw.postedDate ?? null,
    description: null,
    data_source: 'neco',
    tags: [],
    agency_subtype: 'Navy',
    opportunity_type: 'Synopsis',
    part_number: null,
    quantity: null,
  };

  const citations: SourceCitation[] = [];
  citations.push({ field: 'title', source_url: sourceUrl });
  citations.push({ field: 'agency', source_url: sourceUrl });
  if (opportunity.response_due_at) {
    citations.push({ field: 'response_due_at', source_url: sourceUrl });
  }
  if (opportunity.posted_at) {
    citations.push({ field: 'posted_at', source_url: sourceUrl });
  }

  return { opportunity, citations };
}
