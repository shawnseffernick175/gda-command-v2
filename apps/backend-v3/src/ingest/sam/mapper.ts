/**
 * SAM.gov -> opportunities mapper.
 * Converts raw SAM API records to OpportunityRow + SourceCitation arrays.
 * Never silently nulls a field — if data is present, it maps.
 */

import type { SAMOpportunityRaw } from './types.js';
import type { OpportunityRow, SourceCitation } from '../framework/source_writer.js';

export interface MappedOpportunity {
  opportunity: OpportunityRow;
  citations: SourceCitation[];
}

function tsOrNull(value: string | undefined): string | null {
  return value && value.trim() !== '' ? value : null;
}

function buildSAMUrl(noticeId: string): string {
  return `https://sam.gov/opp/${noticeId}/view`;
}

const SAM_NOTICE_TYPE_MAP: Record<string, string> = {
  'sources sought': 'sources_sought',
  'presolicitation': 'presolicitation',
  'combined synopsis/solicitation': 'solicitation',
  'solicitation': 'solicitation',
  'award notice': 'award_notice',
  'special notice': 'special_notice',
  'justification': 'justification',
};

export function classifySAMNoticeType(raw: SAMOpportunityRaw): string | null {
  const value = (raw.type ?? raw.baseType)?.trim().toLowerCase();
  if (!value) return null;
  return SAM_NOTICE_TYPE_MAP[value] ?? null;
}

export function mapSAMOpportunity(raw: SAMOpportunityRaw): MappedOpportunity {
  const orgParts = raw.fullParentPathName?.split('.') ?? [];
  const agency = orgParts[0]?.trim() || null;
  const subAgency = orgParts.slice(1).join(' / ').trim() || null;
  const department = raw.fullParentPathCode?.split('.')?.[0]?.trim() || null;

  let placeOfPerformance: string | null = null;
  if (raw.placeOfPerformance) {
    const parts: string[] = [];
    if (raw.placeOfPerformance.city?.name) parts.push(raw.placeOfPerformance.city.name);
    if (raw.placeOfPerformance.state?.name) parts.push(raw.placeOfPerformance.state.name);
    if (raw.placeOfPerformance.country?.name && raw.placeOfPerformance.country.name !== 'UNITED STATES') {
      parts.push(raw.placeOfPerformance.country.name);
    }
    placeOfPerformance = parts.length > 0 ? parts.join(', ') : null;
  }

  const awardAmount = raw.award?.amount ? parseFloat(raw.award.amount) : null;
  const sourceUrl = raw.uiLink ?? buildSAMUrl(raw.noticeId);

  const opportunity_type = classifySAMNoticeType(raw);
  const tags: string[] = [];
  if (opportunity_type === 'sources_sought') tags.push('sources_sought');

  const opportunity: OpportunityRow = {
    sam_notice_id: raw.noticeId,
    title: raw.title ?? 'Untitled',
    agency,
    sub_agency: subAgency,
    department,
    solicitation_number: raw.solicitationNumber ?? null,
    status: 'discovery',
    value_min: awardAmount,
    value_max: awardAmount,
    naics: raw.naicsCode ?? raw.naicsCodes?.[0] ?? null,
    psc: raw.classificationCode ?? null,
    set_aside: raw.typeOfSetAsideDescription ?? raw.typeOfSetAside ?? null,
    place_of_performance: placeOfPerformance,
    response_due_at: tsOrNull(raw.responseDeadLine),
    posted_at: tsOrNull(raw.postedDate),
    description: raw.description ?? null,
    data_source: 'sam.gov',
    opportunity_type,
    tags,
  };

  const citations: SourceCitation[] = [];
  citations.push({ field: 'title', source_url: sourceUrl });
  if (agency) citations.push({ field: 'agency', source_url: sourceUrl });
  if (opportunity.naics) citations.push({ field: 'naics', source_url: sourceUrl });
  if (opportunity.response_due_at) citations.push({ field: 'response_due_at', source_url: sourceUrl });
  if (opportunity.posted_at) citations.push({ field: 'posted_at', source_url: sourceUrl });
  if (opportunity.value_min !== null) citations.push({ field: 'value_min', source_url: sourceUrl });
  if (opportunity.value_max !== null) citations.push({ field: 'value_max', source_url: sourceUrl });

  return { opportunity, citations };
}
