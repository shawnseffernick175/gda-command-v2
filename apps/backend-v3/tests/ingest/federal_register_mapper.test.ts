import { describe, it, expect } from 'vitest';
import { mapFederalRegisterDocument } from '../../src/ingest/federal_register/mapper.js';
import type { FederalRegisterDocumentRaw } from '../../src/ingest/federal_register/client.js';
import standardRule from '../fixtures/federal_register/standard_rule.json';
import proposedRule from '../fixtures/federal_register/proposed_rule_with_comments.json';
import multiAgency from '../fixtures/federal_register/multi_agency_notice.json';
import presidential from '../fixtures/federal_register/presidential_document.json';
import missingOptional from '../fixtures/federal_register/missing_optional_fields.json';

function asRaw(fixture: Record<string, unknown>): FederalRegisterDocumentRaw {
  return fixture as unknown as FederalRegisterDocumentRaw;
}

describe('mapFederalRegisterDocument', () => {
  it('maps all core fields from a standard Rule', () => {
    const result = mapFederalRegisterDocument(asRaw(standardRule));
    expect(result).not.toBeNull();
    const { notice } = result!;

    expect(notice.document_number).toBe('2026-12345');
    expect(notice.title).toContain('FAR Part 15');
    expect(notice.abstract).toContain('final rule');
    expect(notice.document_type).toBe('Rule');
    expect(notice.agency_names).toContain('Federal Acquisition Regulation');
    expect(notice.agency_names).toContain('Defense Department');
    expect(notice.agency_names).toHaveLength(3);
    expect(notice.publication_date).toBe('2026-05-15');
    expect(notice.effective_date).toBe('2026-07-15');
    expect(notice.comments_close_date).toBeNull();
    expect(notice.cfr_references).toContain('48 CFR 15');
    expect(notice.cfr_references).toContain('48 CFR 52');
    expect(notice.topics).toContain('procurement');
    expect(notice.html_url).toContain('federalregister.gov');
    expect(notice.pdf_url).toContain('govinfo.gov');
    expect(notice.significant).toBe(true);
    expect(notice.data_source).toBe('federalregister.gov');
  });

  it('generates per-field source citations for a standard Rule (R1)', () => {
    const result = mapFederalRegisterDocument(asRaw(standardRule));
    expect(result).not.toBeNull();
    const { citations } = result!;
    const fields = citations.map((c) => c.field);

    expect(fields).toContain('title');
    expect(fields).toContain('agency');
    expect(fields).toContain('effective_date');
    expect(fields).not.toContain('comments_close_date');

    for (const c of citations) {
      expect(c.source_url).toContain('federalregister.gov');
    }
  });

  it('maps a Proposed Rule with comments_close_date', () => {
    const result = mapFederalRegisterDocument(asRaw(proposedRule));
    expect(result).not.toBeNull();
    const { notice, citations } = result!;

    expect(notice.document_number).toBe('2026-23456');
    expect(notice.document_type).toBe('Proposed Rule');
    expect(notice.comments_close_date).toBe('2026-07-20');
    expect(notice.effective_date).toBeNull();
    expect(notice.regulations_dot_gov_docket_id).toBe('DFARS-2026-D012');
    expect(notice.agency_names).toEqual(['Defense Department']);
    expect(notice.significant).toBe(false);

    const fields = citations.map((c) => c.field);
    expect(fields).toContain('comments_close_date');
    expect(fields).not.toContain('effective_date');
  });

  it('maps a multi-agency Notice', () => {
    const result = mapFederalRegisterDocument(asRaw(multiAgency));
    expect(result).not.toBeNull();
    const { notice, citations } = result!;

    expect(notice.document_number).toBe('2026-34567');
    expect(notice.document_type).toBe('Notice');
    expect(notice.agency_names).toHaveLength(2);
    expect(notice.agency_names).toContain('Defense Department');
    expect(notice.agency_names).toContain('General Services Administration');
    expect(notice.pdf_url).toBeNull();
    expect(notice.cfr_references).toHaveLength(0);

    const fields = citations.map((c) => c.field);
    expect(fields).toContain('title');
    expect(fields).toContain('agency');
  });

  it('maps a Presidential Document', () => {
    const result = mapFederalRegisterDocument(asRaw(presidential));
    expect(result).not.toBeNull();
    const { notice } = result!;

    expect(notice.document_number).toBe('2026-45678');
    expect(notice.document_type).toBe('Presidential Document');
    expect(notice.abstract).toBeNull();
    expect(notice.significant).toBe(true);
    expect(notice.effective_date).toBe('2026-05-10');
    expect(notice.agency_names).toEqual(['Executive Office of the President']);
  });

  it('handles missing optional fields gracefully', () => {
    const result = mapFederalRegisterDocument(asRaw(missingOptional));
    expect(result).not.toBeNull();
    const { notice, citations } = result!;

    expect(notice.document_number).toBe('2026-56789');
    expect(notice.abstract).toBeNull();
    expect(notice.agency_names).toHaveLength(0);
    expect(notice.effective_date).toBeNull();
    expect(notice.comments_close_date).toBeNull();
    expect(notice.cfr_references).toHaveLength(0);
    expect(notice.topics).toHaveLength(0);
    expect(notice.pdf_url).toBeNull();
    expect(notice.regulations_dot_gov_docket_id).toBeNull();
    expect(notice.significant).toBe(false);

    // Only title citation — no agencies, no dates
    expect(citations).toHaveLength(1);
    expect(citations[0].field).toBe('title');
  });

  it('returns null for records with no document_number', () => {
    const raw = { ...standardRule, document_number: null } as unknown as FederalRegisterDocumentRaw;
    const result = mapFederalRegisterDocument(raw);
    expect(result).toBeNull();
  });

  it('returns null for records with empty document_number', () => {
    const raw = { ...standardRule, document_number: '' } as unknown as FederalRegisterDocumentRaw;
    const result = mapFederalRegisterDocument(raw);
    expect(result).toBeNull();
  });

  it('returns null for records with no title', () => {
    const raw = { ...standardRule, title: null } as unknown as FederalRegisterDocumentRaw;
    const result = mapFederalRegisterDocument(raw);
    expect(result).toBeNull();
  });

  it('returns null for records with no publication_date', () => {
    const raw = { ...standardRule, publication_date: null } as unknown as FederalRegisterDocumentRaw;
    const result = mapFederalRegisterDocument(raw);
    expect(result).toBeNull();
  });

  it('returns null for records with no html_url', () => {
    const raw = { ...standardRule, html_url: null } as unknown as FederalRegisterDocumentRaw;
    const result = mapFederalRegisterDocument(raw);
    expect(result).toBeNull();
  });

  it('extracts docket_id from docket_ids when regulations_dot_gov_info is null', () => {
    const result = mapFederalRegisterDocument(asRaw(standardRule));
    expect(result).not.toBeNull();
    expect(result!.notice.regulations_dot_gov_docket_id).toBe('FAR-2026-0042');
  });

  it('prefers regulations_dot_gov_info.document_id over docket_ids', () => {
    const result = mapFederalRegisterDocument(asRaw(proposedRule));
    expect(result).not.toBeNull();
    expect(result!.notice.regulations_dot_gov_docket_id).toBe('DFARS-2026-D012');
  });
});
