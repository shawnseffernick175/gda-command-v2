/**
 * GovTribe -> opportunities mapper.
 * Converts GovTribe MCP detail records to ExternalOpportunityRow + SourceCitation.
 *
 * Supports both the live MCP detail shape (GovTribeDetailRecord)
 * and the legacy REST shape (GovTribeOpportunityRaw) for backward compat.
 */

import type { GovTribeDetailRecord, GovTribeOpportunityRaw } from './types.js';
import type { ExternalOpportunityRow, SourceCitation } from '../framework/source_writer.js';

export interface MappedGovTribeOpp {
  opportunity: ExternalOpportunityRow;
  citations: SourceCitation[];
  govtribe_id: string;
  source_uri: string;
}

function buildPlaceOfPerformance(detail: GovTribeDetailRecord): string | null {
  const pop = detail.place_of_performance;
  if (!pop) return null;
  const parts = [pop.city, pop.state, pop.zip, pop.country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Map a live MCP detail record to the canonical opportunity shape.
 */
export function mapGovTribeDetail(detail: GovTribeDetailRecord): MappedGovTribeOpp | null {
  if (!detail.govtribe_id) return null;

  const sourceUri = detail.govtribe_url
    ?? `https://govtribe.com/opportunity/${detail.govtribe_id}`;
  const title = detail.name ?? 'Untitled GovTribe Opportunity';

  const agencyName = detail.federal_agency?.name ?? null;
  const subAgency = detail.federal_agency?.sub_tier ?? null;
  const description = detail.descriptions?.join('\n\n') ?? null;

  const opportunity: ExternalOpportunityRow = {
    external_id: detail.govtribe_id,
    title,
    agency: agencyName,
    sub_agency: subAgency,
    department: null,
    solicitation_number: detail.solicitation_number ?? null,
    status: 'discovery',
    value_min: null,
    value_max: null,
    naics: detail.naics_category?.code ?? null,
    psc: detail.psc_category?.code ?? null,
    set_aside: detail.set_aside_type ?? null,
    place_of_performance: buildPlaceOfPerformance(detail),
    response_due_at: detail.due_date ?? null,
    posted_at: detail.posted_date ?? null,
    description,
    data_source: 'govtribe',
    tags: ['govtribe'],
    agency_subtype: detail.federal_agency?.office ?? null,
    opportunity_type: detail.opportunity_type ?? null,
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
    govtribe_id: detail.govtribe_id,
    source_uri: sourceUri,
  };
}

/**
 * Map a legacy REST shape — kept for backward compatibility with cached data.
 */
export function mapGovTribeOpportunity(raw: GovTribeOpportunityRaw): MappedGovTribeOpp | null {
  const govtribeId = raw.govtribe_id ?? raw._id ?? raw.id ?? '';
  if (!govtribeId) return null;

  const attrs = raw.attributes ?? {};
  const slug = attrs.slug ?? govtribeId;
  const sourceUri = `https://govtribe.com/opportunity/${slug}`;
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
