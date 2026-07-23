import { describe, it, expect } from 'vitest';
import { mapNSFAward } from '../../src/ingest/nsf/mapper.js';
import type { NSFAwardRaw } from '../../src/ingest/nsf/types.js';

function makeNSFRecord(overrides: Partial<NSFAwardRaw> = {}): NSFAwardRaw {
  return {
    id: '2401234',
    title: '  Quantum-Enhanced Cyber Defense Framework  ',
    abstractText: 'This project develops novel quantum algorithms for cybersecurity.',
    awardeeName: 'MIT Lincoln Laboratory',
    awardeeStateCode: 'MA',
    estimatedTotalAmt: '750000',
    fundsObligatedAmt: '500000',
    pdPIName: 'Jane Smith',
    startDate: '05/15/2026',
    expDate: '05/14/2029',
    fundProgramName: 'Computer and Information Science and Engineering',
    agency: 'National Science Foundation',
    date: '05/15/2026',
    awardAgencyCode: '4900',
    primaryProgram: 'Secure & Trustworthy Cyberspace',
    ...overrides,
  };
}

describe('mapNSFAward', () => {
  it('maps all core fields from raw NSF record', () => {
    const result = mapNSFAward(makeNSFRecord());
    expect(result).not.toBeNull();
    const { opportunity } = result!;

    expect(opportunity.external_id).toBe('2401234');
    expect(opportunity.title).toBe('Quantum-Enhanced Cyber Defense Framework');
    expect(opportunity.agency).toBe('National Science Foundation');
    expect(opportunity.sub_agency).toBe('Secure & Trustworthy Cyberspace');
    expect(opportunity.department).toBe('National Science Foundation');
    expect(opportunity.status).toBe('discovery');
    expect(opportunity.data_source).toBe('nsf');
    expect(opportunity.posted_at).toBe('2026-05-15');
    expect(opportunity.value_min).toBe(750000);
    expect(opportunity.value_max).toBe(750000);
    expect(opportunity.place_of_performance).toBe('MA');
    expect(opportunity.tags).toContain('fast_track');
    expect(opportunity.tags).toContain('signal');
    expect(opportunity.tags).toContain('nsf');
    expect(opportunity.tags).toContain('research');
    expect(opportunity.opportunity_type).toBe('research_award');
    expect(opportunity.description).toBe(
      'This project develops novel quantum algorithms for cybersecurity.',
    );
    expect(opportunity.agency_subtype).toBe(
      'Computer and Information Science and Engineering',
    );
  });

  it('returns null when id is missing', () => {
    expect(mapNSFAward(makeNSFRecord({ id: undefined }))).toBeNull();
  });

  it('returns null when id is empty string', () => {
    expect(mapNSFAward(makeNSFRecord({ id: '' }))).toBeNull();
  });

  it('converts posted_at from MM/DD/YYYY to YYYY-MM-DD', () => {
    const result = mapNSFAward(makeNSFRecord({ date: '01/31/2025' }));
    expect(result!.opportunity.posted_at).toBe('2025-01-31');
  });

  it('prefers award date over startDate for posted_at', () => {
    const result = mapNSFAward(
      makeNSFRecord({ date: '03/10/2026', startDate: '10/01/2026' }),
    );
    expect(result!.opportunity.posted_at).toBe('2026-03-10');
  });

  it('falls back to startDate for posted_at when award date is absent', () => {
    const result = mapNSFAward(
      makeNSFRecord({ date: undefined, startDate: '10/01/2026' }),
    );
    expect(result!.opportunity.posted_at).toBe('2026-10-01');
  });

  it('returns posted_at as null for unparseable date', () => {
    const result = mapNSFAward(
      makeNSFRecord({ date: 'not-a-date', startDate: 'not-a-date' }),
    );
    expect(result!.opportunity.posted_at).toBeNull();
  });

  it('parses value from estimatedTotalAmt', () => {
    const result = mapNSFAward(makeNSFRecord({ estimatedTotalAmt: '1200000' }));
    expect(result!.opportunity.value_min).toBe(1200000);
    expect(result!.opportunity.value_max).toBe(1200000);
  });

  it('falls back to fundsObligatedAmt when estimatedTotalAmt is absent', () => {
    const result = mapNSFAward(
      makeNSFRecord({ estimatedTotalAmt: undefined, fundsObligatedAmt: '300000' }),
    );
    expect(result!.opportunity.value_min).toBe(300000);
    expect(result!.opportunity.value_max).toBe(300000);
  });

  it('sets value_min/value_max to null when both amounts missing', () => {
    const result = mapNSFAward(
      makeNSFRecord({ estimatedTotalAmt: undefined, fundsObligatedAmt: undefined }),
    );
    expect(result!.opportunity.value_min).toBeNull();
    expect(result!.opportunity.value_max).toBeNull();
  });

  it('defaults agency to National Science Foundation when raw.agency is missing', () => {
    const result = mapNSFAward(makeNSFRecord({ agency: undefined }));
    expect(result!.opportunity.agency).toBe('National Science Foundation');
  });

  it('uses awardeeStateCode for place_of_performance', () => {
    const result = mapNSFAward(makeNSFRecord({ awardeeStateCode: 'CA' }));
    expect(result!.opportunity.place_of_performance).toBe('CA');
  });

  it('generates per-field source citations (R1)', () => {
    const result = mapNSFAward(makeNSFRecord());
    const { citations } = result!;

    const fields = citations.map((c) => c.field);
    expect(fields).toContain('title');
    expect(fields).toContain('agency');
    expect(fields).toContain('posted_at');
    expect(fields).toContain('value_min');
    expect(fields).toContain('value_max');

    for (const citation of citations) {
      expect(citation.source_url).toBe(
        'https://www.nsf.gov/awardsearch/showAward?AWD_ID=2401234',
      );
    }
  });

  it('omits value citations when amount is unparseable', () => {
    const result = mapNSFAward(
      makeNSFRecord({ estimatedTotalAmt: undefined, fundsObligatedAmt: undefined }),
    );
    const fields = result!.citations.map((c) => c.field);
    expect(fields).not.toContain('value_min');
    expect(fields).not.toContain('value_max');
  });

  it('omits posted_at citation when both award date and startDate are missing', () => {
    const result = mapNSFAward(
      makeNSFRecord({ date: undefined, startDate: undefined }),
    );
    const fields = result!.citations.map((c) => c.field);
    expect(fields).not.toContain('posted_at');
  });

  it('does not emit citations for fields without FIELD_TO_TABLE entries', () => {
    const result = mapNSFAward(makeNSFRecord());
    const fields = result!.citations.map((c) => c.field);
    // These fields have no FIELD_TO_TABLE entry in source_writer
    expect(fields).not.toContain('description');
    expect(fields).not.toContain('place_of_performance');
    expect(fields).not.toContain('set_aside');
    expect(fields).not.toContain('department');
  });
});
