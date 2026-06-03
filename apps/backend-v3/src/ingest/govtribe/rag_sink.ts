/**
 * RAG sink for GovTribe ingest — writes each opportunity to kb_documents
 * via the existing F-301 RAG ingest path.
 *
 * doc_type: 'govtribe'
 * evidence_grade: 'B'
 */

import { ingestFromBuffer } from '../../services/rag/store.js';
import { logger } from '../../lib/logger.js';
import type { GovTribeDetailRecord, GovTribeOpportunityRaw, GovTribeAwardDetail, GovTribeForecastDetail } from './types.js';
import type { MappedGovTribeAward, MappedGovTribeForecast } from './mapper.js';

/**
 * Ingest a GovTribe MCP detail record into the RAG knowledge base.
 */
export async function ingestGovTribeDetailToRag(
  detail: GovTribeDetailRecord,
  searchName: string,
): Promise<void> {
  const id = detail.govtribe_id;
  const title = detail.name ?? 'Untitled';
  const sourceUrl = detail.govtribe_url
    ?? `https://govtribe.com/opportunity/${id}`;

  const textContent = buildDetailRagText(detail, searchName);
  const buffer = Buffer.from(textContent, 'utf-8');

  try {
    await ingestFromBuffer(buffer, {
      source_filename: `govtribe-${id}.txt`,
      source_url: sourceUrl,
      doc_type: 'govtribe',
      evidence_grade: 'B',
      title: `[GovTribe] ${title}`,
      metadata: {
        govtribe_id: id,
        search_name: searchName,
        solicitation_number: detail.solicitation_number ?? null,
        agency: detail.federal_agency?.name ?? null,
        naics: detail.naics_category?.code ?? null,
        posted_date: detail.posted_date ?? null,
        response_date: detail.due_date ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('existing')) return;
    logger.warn(
      { source: 'govtribe', govtribeId: id, error: err instanceof Error ? err.message : String(err) },
      'govtribe_rag_ingest_warn',
    );
  }
}

function buildDetailRagText(detail: GovTribeDetailRecord, searchName: string): string {
  const lines: string[] = [];

  lines.push(`# ${detail.name ?? 'Untitled GovTribe Opportunity'}`);
  lines.push(`Source: GovTribe Saved Search "${searchName}"`);
  lines.push('');

  if (detail.solicitation_number) lines.push(`Solicitation: ${detail.solicitation_number}`);
  if (detail.federal_agency?.name) lines.push(`Agency: ${detail.federal_agency.name}`);
  if (detail.federal_agency?.sub_tier) lines.push(`Sub-Agency: ${detail.federal_agency.sub_tier}`);
  if (detail.federal_agency?.office) lines.push(`Office: ${detail.federal_agency.office}`);
  if (detail.naics_category?.code) lines.push(`NAICS: ${detail.naics_category.code}`);
  if (detail.psc_category?.code) lines.push(`PSC: ${detail.psc_category.code}`);
  if (detail.set_aside_type) lines.push(`Set-Aside: ${detail.set_aside_type}`);

  const pop = detail.place_of_performance;
  if (pop) {
    const parts = [pop.city, pop.state, pop.zip, pop.country].filter(Boolean);
    if (parts.length > 0) lines.push(`Place of Performance: ${parts.join(', ')}`);
  }

  if (detail.opportunity_state) lines.push(`Status: ${detail.opportunity_state}`);
  if (detail.posted_date) lines.push(`Posted: ${detail.posted_date}`);
  if (detail.due_date) lines.push(`Response Due: ${detail.due_date}`);
  if (detail.award_date) lines.push(`Award Date: ${detail.award_date}`);

  if (detail.descriptions && detail.descriptions.length > 0) {
    lines.push('');
    lines.push('## Description');
    lines.push(detail.descriptions.join('\n\n'));
  }

  if (detail.points_of_contact && detail.points_of_contact.length > 0) {
    lines.push('');
    lines.push('## Contacts');
    for (const c of detail.points_of_contact) {
      const parts = [c.name, c.title, c.email, c.phone].filter(Boolean);
      lines.push(`- ${parts.join(' | ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Legacy RAG sink for GovTribeOpportunityRaw — kept for cached data reprocessing.
 */
export async function ingestGovTribeToRag(
  raw: GovTribeOpportunityRaw,
  searchName: string,
): Promise<void> {
  const id = raw._id ?? raw.id ?? 'unknown';
  const attrs = raw.attributes ?? {};
  const title = attrs.title ?? 'Untitled';
  const slug = attrs.slug ?? id;
  const sourceUrl = `https://govtribe.com/opportunity/${slug}`;

  const textContent = buildRagText(raw, searchName);
  const buffer = Buffer.from(textContent, 'utf-8');

  try {
    await ingestFromBuffer(buffer, {
      source_filename: `govtribe-${id}.txt`,
      source_url: sourceUrl,
      doc_type: 'govtribe',
      evidence_grade: 'B',
      title: `[GovTribe] ${title}`,
      metadata: {
        govtribe_id: id,
        search_name: searchName,
        solicitation_number: attrs.solicitationNumber ?? null,
        agency: attrs.agency?.name ?? null,
        naics: attrs.naicsCode ?? null,
        posted_date: attrs.postedDate ?? null,
        response_date: attrs.responseDate ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('existing')) return;
    logger.warn(
      { source: 'govtribe', govtribeId: id, error: err instanceof Error ? err.message : String(err) },
      'govtribe_rag_ingest_warn',
    );
  }
}

function buildRagText(raw: GovTribeOpportunityRaw, searchName: string): string {
  const attrs = raw.attributes ?? {};
  const lines: string[] = [];

  lines.push(`# ${attrs.title ?? 'Untitled GovTribe Opportunity'}`);
  lines.push(`Source: GovTribe Saved Search "${searchName}"`);
  lines.push('');

  if (attrs.solicitationNumber) lines.push(`Solicitation: ${attrs.solicitationNumber}`);
  if (attrs.agency?.name) lines.push(`Agency: ${attrs.agency.name}`);
  if (attrs.agency?.subTier) lines.push(`Sub-Agency: ${attrs.agency.subTier}`);
  if (attrs.agency?.office) lines.push(`Office: ${attrs.agency.office}`);
  if (attrs.naicsCode) lines.push(`NAICS: ${attrs.naicsCode}`);
  if (attrs.pscCode) lines.push(`PSC: ${attrs.pscCode}`);
  if (attrs.setAside) lines.push(`Set-Aside: ${attrs.setAside}`);
  if (attrs.placeOfPerformance) lines.push(`Place of Performance: ${attrs.placeOfPerformance}`);
  if (attrs.status) lines.push(`Status: ${attrs.status}`);
  if (attrs.postedDate) lines.push(`Posted: ${attrs.postedDate}`);
  if (attrs.responseDate) lines.push(`Response Due: ${attrs.responseDate}`);
  if (attrs.awardDate) lines.push(`Award Date: ${attrs.awardDate}`);

  if (attrs.estimatedValue) {
    const low = attrs.estimatedValue.low;
    const high = attrs.estimatedValue.high;
    if (low || high) {
      lines.push(`Estimated Value: $${low?.toLocaleString() ?? '?'} – $${high?.toLocaleString() ?? '?'}`);
    }
  } else if (attrs.awardAmount) {
    lines.push(`Award Amount: $${attrs.awardAmount.toLocaleString()}`);
  }

  if (attrs.incumbent?.name) {
    lines.push(`Incumbent: ${attrs.incumbent.name}${attrs.incumbent.uei ? ` (UEI: ${attrs.incumbent.uei})` : ''}`);
  }

  if (attrs.description) {
    lines.push('');
    lines.push('## Description');
    lines.push(attrs.description);
  }

  if (attrs.contacts && attrs.contacts.length > 0) {
    lines.push('');
    lines.push('## Contacts');
    for (const c of attrs.contacts) {
      const parts = [c.name, c.title, c.email, c.phone].filter(Boolean);
      lines.push(`- ${parts.join(' | ')}`);
    }
  }

  return lines.join('\n');
}

/* ── Award RAG sink ─────────────────────────────────────────────── */

export async function ingestGovTribeAwardToRag(
  detail: GovTribeAwardDetail,
  mapped: MappedGovTribeAward,
  searchName: string,
): Promise<void> {
  const id = detail.govtribe_id;
  const sourceUrl = mapped.source_uri;

  const lines: string[] = [];
  lines.push(`# [Award] ${mapped.title}`);
  lines.push(`Source: GovTribe Saved Search "${searchName}"`);
  lines.push('');
  if (mapped.contract_number) lines.push(`Contract Number: ${mapped.contract_number}`);
  if (mapped.agency) lines.push(`Contracting Agency: ${mapped.agency}`);
  if (mapped.awardee) lines.push(`Awardee: ${mapped.awardee}${mapped.awardee_uei ? ` (UEI: ${mapped.awardee_uei})` : ''}`);
  if (detail.parent_of_awardee?.name) lines.push(`Parent of Awardee: ${detail.parent_of_awardee.name}`);
  if (mapped.award_date) lines.push(`Award Date: ${mapped.award_date}`);
  if (detail.completion_date) lines.push(`Completion Date: ${detail.completion_date}`);
  if (mapped.ceiling_value) lines.push(`Ceiling Value: $${mapped.ceiling_value.toLocaleString()}`);
  if (mapped.dollars_obligated) lines.push(`Dollars Obligated: $${mapped.dollars_obligated.toLocaleString()}`);
  if (mapped.naics) lines.push(`NAICS: ${mapped.naics}`);
  if (mapped.set_aside) lines.push(`Set-Aside: ${mapped.set_aside}`);
  if (detail.extent_competed) lines.push(`Extent Competed: ${detail.extent_competed}`);
  if (detail.originating_federal_contract_opportunity?.name) {
    lines.push(`Originating Opportunity: ${detail.originating_federal_contract_opportunity.name}`);
  }
  if (mapped.description) {
    lines.push('');
    lines.push('## Description');
    lines.push(mapped.description);
  }

  const buffer = Buffer.from(lines.join('\n'), 'utf-8');

  try {
    await ingestFromBuffer(buffer, {
      source_filename: `govtribe-award-${id}.txt`,
      source_url: sourceUrl,
      doc_type: 'govtribe_award',
      evidence_grade: 'B',
      title: `[GovTribe Award] ${mapped.title}`,
      metadata: {
        govtribe_id: id,
        search_name: searchName,
        category: 'award',
        agency: mapped.agency,
        awardee: mapped.awardee,
        contract_number: mapped.contract_number,
        award_date: mapped.award_date,
        naics: mapped.naics,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('existing')) return;
    logger.warn(
      { source: 'govtribe', govtribeId: id, error: err instanceof Error ? err.message : String(err) },
      'govtribe_award_rag_ingest_warn',
    );
  }
}

/* ── Forecast RAG sink ──────────────────────────────────────────── */

export async function ingestGovTribeForecastToRag(
  detail: GovTribeForecastDetail,
  mapped: MappedGovTribeForecast,
  searchName: string,
): Promise<void> {
  const id = detail.govtribe_id;
  const sourceUrl = mapped.source_uri;

  const lines: string[] = [];
  lines.push(`# [Forecast] ${mapped.title}`);
  lines.push(`Source: GovTribe Saved Search "${searchName}"`);
  lines.push('');
  if (mapped.agency) lines.push(`Agency: ${mapped.agency}`);
  if (mapped.forecast_type) lines.push(`Forecast Type: ${mapped.forecast_type}`);
  if (mapped.set_aside) lines.push(`Set-Aside: ${mapped.set_aside}`);
  if (mapped.estimated_solicitation_date) lines.push(`Est. Solicitation Date: ${mapped.estimated_solicitation_date}`);
  if (mapped.estimated_award_date) lines.push(`Est. Award Date: ${mapped.estimated_award_date}`);
  if (mapped.estimated_value_low !== null || mapped.estimated_value_high !== null) {
    lines.push(`Est. Value: $${mapped.estimated_value_low?.toLocaleString() ?? '?'} – $${mapped.estimated_value_high?.toLocaleString() ?? '?'}`);
  }
  if (mapped.description) {
    lines.push('');
    lines.push('## Description');
    lines.push(mapped.description);
  }
  if (detail.points_of_contact && detail.points_of_contact.length > 0) {
    lines.push('');
    lines.push('## Contacts');
    for (const c of detail.points_of_contact) {
      const parts = [c.name, c.title, c.email, c.phone].filter(Boolean);
      lines.push(`- ${parts.join(' | ')}`);
    }
  }

  const buffer = Buffer.from(lines.join('\n'), 'utf-8');

  try {
    await ingestFromBuffer(buffer, {
      source_filename: `govtribe-forecast-${id}.txt`,
      source_url: sourceUrl,
      doc_type: 'govtribe_forecast',
      evidence_grade: 'B',
      title: `[GovTribe Forecast] ${mapped.title}`,
      metadata: {
        govtribe_id: id,
        search_name: searchName,
        category: 'forecast',
        agency: mapped.agency,
        forecast_type: mapped.forecast_type,
        estimated_solicitation_date: mapped.estimated_solicitation_date,
        estimated_award_date: mapped.estimated_award_date,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('existing')) return;
    logger.warn(
      { source: 'govtribe', govtribeId: id, error: err instanceof Error ? err.message : String(err) },
      'govtribe_forecast_rag_ingest_warn',
    );
  }
}
