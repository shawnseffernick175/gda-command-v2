/**
 * DIBBS record → opportunities row mapper.
 * Maps parsed DIBBS data to ExternalOpportunityRow + SourceCitation arrays.
 */

import type { DIBBSRecord } from './parser.js';
import type { ExternalOpportunityRow, SourceCitation } from '../framework/source_writer.js';
import { DIBBS_BASE } from './client.js';

export interface MappedDIBBSOpportunity {
  opportunity: ExternalOpportunityRow;
  citations: SourceCitation[];
}

function buildDIBBSUrl(solNum: string, detailUrl: string | null): string {
  if (detailUrl) {
    return detailUrl.startsWith('http') ? detailUrl : `${DIBBS_BASE}${detailUrl}`;
  }
  return `${DIBBS_BASE}/RFQ/RfqRec_SearchResult.aspx?solNum=${encodeURIComponent(solNum)}`;
}

export function mapDIBBSRecord(raw: DIBBSRecord): MappedDIBBSOpportunity {
  const sourceUrl = buildDIBBSUrl(raw.solicitationNumber, raw.detailUrl);

  const opportunity: ExternalOpportunityRow = {
    external_id: raw.solicitationNumber,
    title: raw.title || `DIBBS RFQ ${raw.solicitationNumber}`,
    agency: 'Defense Logistics Agency',
    sub_agency: null,
    department: 'DLA',
    solicitation_number: raw.solicitationNumber,
    status: 'discovery',
    value_min: null,
    value_max: null,
    naics: null,
    psc: null,
    set_aside: null,
    place_of_performance: null,
    response_due_at: raw.returnByDate ?? null,
    posted_at: raw.postedDate ?? null,
    description: raw.nsn ? `NSN: ${raw.nsn}` : null,
    data_source: 'dibbs',
    tags: [],
    agency_subtype: 'DLA',
    opportunity_type: 'RFQ',
    part_number: raw.partNumber ?? null,
    quantity: raw.quantity ?? null,
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
