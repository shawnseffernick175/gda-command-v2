/**
 * RAG sink for GovTribe ingest — writes each opportunity to kb_documents
 * via the existing F-301 RAG ingest path.
 *
 * doc_type: 'govtribe'
 * evidence_grade: 'B'
 */

import { ingestFromBuffer } from '../../services/rag/store.js';
import { logger } from '../../lib/logger.js';
import type { GovTribeOpportunityRaw } from './types.js';

/**
 * Ingest a GovTribe opportunity record into the RAG knowledge base.
 * Converts the raw JSON to a text buffer and uses the F-301 ingest path.
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
    // Dedup (sha256 match) returns 'existing' status — not an error
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
