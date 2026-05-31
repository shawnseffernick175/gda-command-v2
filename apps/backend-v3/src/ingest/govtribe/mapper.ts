/**
 * GovTribe -> opportunities mapper.
 * Converts raw GovTribe API records to ExternalOpportunityRow + SourceCitation.
 */

import type { GovTribeOpportunityRaw } from './types.js';
import type { ExternalOpportunityRow, SourceCitation } from '../framework/source_writer.js';

export interface MappedGovTribeOpp {
  opportunity: ExternalOpportunityRow;
  citations: SourceCitation[];
  govtribe_id: string;
  source_uri: string;
}

function buildGovTribeUrl(raw: GovTribeOpportunityRaw): string {
  const slug = raw.attributes?.slug ?? raw._id ?? raw.id ?? '';
  return `https://govtribe.com/opportunity/${slug}`;
}

function extractId(raw: GovTribeOpportunityRaw): string {
  return raw._id ?? raw.id ?? '';
}

export function mapGovTribeOpportunity(raw: GovTribeOpportunityRaw): MappedGovTribeOpp | null {
  const govtribeId = extractId(raw);
  if (!govtribeId) return null;

  const attrs = raw.attributes ?? {};
  const sourceUri = buildGovTribeUrl(raw);
  const title = attrs.title ?? 'Untitled GovTribe Opportunity';

  const agencyName = attrs.agency?.name ?? null;
  const subAgency = attrs.agency?.subTier ?? null;

  const opportunity: ExternalOpportunityRow = {
    external_id: govtribeId,
    title,
    agency: agencyName,
    sub_agency: subAgency,
    department: null,
    solicitation_number: attrs.solicitationNumber ?? null,
    status: 'discovery',
    value_min: attrs.estimatedValue?.low ?? attrs.awardAmount ?? null,
    value_max: attrs.estimatedValue?.high ?? attrs.awardAmount ?? null,
    naics: attrs.naicsCode ?? null,
    psc: attrs.pscCode ?? null,
    set_aside: attrs.setAside ?? null,
    place_of_performance: attrs.placeOfPerformance ?? null,
    response_due_at: attrs.responseDate ?? null,
    posted_at: attrs.postedDate ?? null,
    description: attrs.description ?? null,
    data_source: 'govtribe',
    tags: ['govtribe'],
    agency_subtype: attrs.agency?.office ?? null,
    opportunity_type: null,
    part_number: null,
    quantity: null,
  };

  const citations: SourceCitation[] = [];
  citations.push({ field: 'title', source_url: sourceUri });
  if (agencyName) citations.push({ field: 'agency', source_url: sourceUri });
  if (opportunity.naics) citations.push({ field: 'naics', source_url: sourceUri });
  if (opportunity.response_due_at) citations.push({ field: 'response_due_at', source_url: sourceUri });
  if (opportunity.posted_at) citations.push({ field: 'posted_at', source_url: sourceUri });
  if (opportunity.value_min !== null) citations.push({ field: 'value_min', source_url: sourceUri });
  if (opportunity.value_max !== null) citations.push({ field: 'value_max', source_url: sourceUri });

  return {
    opportunity,
    citations,
    govtribe_id: govtribeId,
    source_uri: sourceUri,
  };
}
