/**
 * RAG sink for GovTribe ingest — writes each opportunity to kb_documents
 * via the existing F-301 RAG ingest path.
 *
 * doc_type: 'govtribe'
 * evidence_grade: 'B'
 */

import { ingestFromBuffer } from '../../services/rag/store.js';
import { logger } from '../../lib/logger.js';
import type { GovTribeDetailRecord, GovTribeOpportunityRaw } from './types.js';

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
