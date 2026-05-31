/**
 * Federal Register document → regulatory_notices row mapper.
 * Converts raw FR API records to DB rows + per-field R1 source citations.
 */

import type { FederalRegisterDocumentRaw } from './client.js';

export interface RegulatoryNoticeRow {
  document_number: string;
  title: string;
  abstract: string | null;
  document_type: string | null;
  agency_names: string[];
  publication_date: string;
  effective_date: string | null;
  comments_close_date: string | null;
  cfr_references: string[];
  topics: string[];
  html_url: string;
  pdf_url: string | null;
  regulations_dot_gov_docket_id: string | null;
  significant: boolean;
  data_source: string;
}

export interface RegulatoryNoticeCitation {
  field: string;
  source_url: string;
}

export interface MappedRegulatoryNotice {
  notice: RegulatoryNoticeRow;
  citations: RegulatoryNoticeCitation[];
}

function trimOrNull(val: string | null | undefined): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function parseDateOrNull(val: string | null | undefined): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '') return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(s);
  return match ? match[0] : null;
}

function extractAgencyNames(
  agencies: FederalRegisterDocumentRaw['agencies'] | undefined,
): string[] {
  if (!agencies || !Array.isArray(agencies)) return [];
  return agencies
    .map((a) => a.name || a.raw_name)
    .filter((n): n is string => Boolean(n));
}

function formatCfrReferences(
  refs: FederalRegisterDocumentRaw['cfr_references'] | undefined,
): string[] {
  if (!refs || !Array.isArray(refs)) return [];
  return refs
    .map((r) => `${r.title} CFR ${r.part}`)
    .filter((s) => !s.includes('undefined') && !s.includes('NaN'));
}

function extractDocketId(doc: FederalRegisterDocumentRaw): string | null {
  if (doc.regulations_dot_gov_info?.document_id) {
    return doc.regulations_dot_gov_info.document_id;
  }
  if (doc.docket_ids && doc.docket_ids.length > 0) {
    return doc.docket_ids[0];
  }
  return null;
}

export function mapFederalRegisterDocument(
  raw: FederalRegisterDocumentRaw,
): MappedRegulatoryNotice | null {
  const documentNumber = trimOrNull(raw.document_number);
  if (!documentNumber) return null;

  const title = trimOrNull(raw.title);
  if (!title) return null;

  const publicationDate = parseDateOrNull(raw.publication_date);
  if (!publicationDate) return null;

  const htmlUrl = trimOrNull(raw.html_url);
  if (!htmlUrl) return null;

  const sourceUrl = htmlUrl;

  const notice: RegulatoryNoticeRow = {
    document_number: documentNumber,
    title,
    abstract: trimOrNull(raw.abstract),
    document_type: trimOrNull(raw.type),
    agency_names: extractAgencyNames(raw.agencies),
    publication_date: publicationDate,
    effective_date: parseDateOrNull(raw.effective_on),
    comments_close_date: parseDateOrNull(raw.comments_close_on),
    cfr_references: formatCfrReferences(raw.cfr_references),
    topics: Array.isArray(raw.topics) ? raw.topics.filter(Boolean) : [],
    html_url: htmlUrl,
    pdf_url: trimOrNull(raw.pdf_url),
    regulations_dot_gov_docket_id: extractDocketId(raw),
    significant: raw.significant === true,
    data_source: 'federalregister.gov',
  };

  const citations: RegulatoryNoticeCitation[] = [];

  citations.push({ field: 'title', source_url: sourceUrl });

  if (notice.agency_names.length > 0) {
    citations.push({ field: 'agency', source_url: sourceUrl });
  }
  if (notice.effective_date) {
    citations.push({ field: 'effective_date', source_url: sourceUrl });
  }
  if (notice.comments_close_date) {
    citations.push({ field: 'comments_close_date', source_url: sourceUrl });
  }

  return { notice, citations };
}
