import { describe, it, expect } from 'vitest';
import { mapGovTribeDetail, mapGovTribeOpportunity } from '../../src/ingest/govtribe/mapper.js';
import type { GovTribeDetailRecord, GovTribeOpportunityRaw } from '../../src/ingest/govtribe/types.js';

describe('mapGovTribeDetail (F-330 MCP detail shape)', () => {
  const fullDetail: GovTribeDetailRecord = {
    govtribe_id: 'abc-123',
    govtribe_url: 'https://govtribe.com/opportunity/abc-123',
    name: 'SETA Support Services',
    solicitation_number: 'W15QKN-25-R-0001',
    opportunity_type: 'Solicitation',
    opportunity_state: 'Open',
    set_aside_type: 'Total Small Business',
    posted_date: '2026-05-01',
    due_date: '2026-06-15',
    descriptions: ['Provide SETA support.', 'Period of performance: 5 years.'],
    federal_agency: {
      govtribe_id: 'agency-1',
      name: 'Department of the Army',
      sub_tier: 'PEO IEW&S',
      office: 'ACC-APG',
    },
    naics_category: { code: '541511', name: 'Custom Computer Programming Services' },
    psc_category: { code: 'R425', name: 'Engineering/Technical' },
    place_of_performance: { city: 'Aberdeen', state: 'MD', zip: '21005', country: 'US' },
    points_of_contact: [
      { name: 'John Doe', email: 'john@army.mil', phone: '410-555-0100', role: 'Primary' },
    ],
  };

  it('maps all fields from a full detail record', () => {
    const result = mapGovTribeDetail(fullDetail);
    expect(result).not.toBeNull();
    const opp = result!.opportunity;

    expect(opp.external_id).toBe('abc-123');
    expect(opp.title).toBe('SETA Support Services');
    expect(opp.agency).toBe('Department of the Army');
    expect(opp.sub_agency).toBe('PEO IEW&S');
    expect(opp.solicitation_number).toBe('W15QKN-25-R-0001');
    expect(opp.naics).toBe('541511');
    expect(opp.psc).toBe('R425');
    expect(opp.set_aside).toBe('Total Small Business');
    expect(opp.response_due_at).toBe('2026-06-15');
    expect(opp.posted_at).toBe('2026-05-01');
    expect(opp.description).toBe('Provide SETA support.\n\nPeriod of performance: 5 years.');
    expect(opp.place_of_performance).toBe('Aberdeen, MD, 21005, US');
    expect(opp.data_source).toBe('govtribe');
    expect(opp.agency_subtype).toBe('ACC-APG');
    expect(opp.opportunity_type).toBe('Solicitation');
  });

  it('generates source citations for populated fields', () => {
    const result = mapGovTribeDetail(fullDetail);
    expect(result!.citations.length).toBeGreaterThanOrEqual(5);
    expect(result!.citations[0].field).toBe('title');
    expect(result!.citations[0].source_url).toBe('https://govtribe.com/opportunity/abc-123');
  });

  it('returns null for missing govtribe_id', () => {
    const bad = { ...fullDetail, govtribe_id: '' };
    expect(mapGovTribeDetail(bad)).toBeNull();
  });

  it('handles minimal detail (ID only)', () => {
    const minimal: GovTribeDetailRecord = { govtribe_id: 'min-001' };
    const result = mapGovTribeDetail(minimal);
    expect(result).not.toBeNull();
    expect(result!.opportunity.title).toBe('Untitled GovTribe Opportunity');
    expect(result!.opportunity.agency).toBeNull();
    expect(result!.source_uri).toBe('https://govtribe.com/opportunity/min-001');
  });

  it('joins descriptions array with double newline', () => {
    const detail: GovTribeDetailRecord = {
      govtribe_id: 'desc-001',
      descriptions: ['Part A', 'Part B', 'Part C'],
    };
    const result = mapGovTribeDetail(detail);
    expect(result!.opportunity.description).toBe('Part A\n\nPart B\n\nPart C');
  });

  it('builds place_of_performance from partial components', () => {
    const detail: GovTribeDetailRecord = {
      govtribe_id: 'pop-001',
      place_of_performance: { state: 'VA' },
    };
    const result = mapGovTribeDetail(detail);
    expect(result!.opportunity.place_of_performance).toBe('VA');
  });
});

describe('mapGovTribeOpportunity (legacy REST shape)', () => {
  it('maps from legacy attributes shape', () => {
    const raw: GovTribeOpportunityRaw = {
      _id: 'legacy-001',
      attributes: {
        title: 'Legacy Opp',
        agency: { name: 'DoD', subTier: 'Army' },
        solicitationNumber: 'W91234',
        naicsCode: '541512',
        responseDate: '2026-07-01',
        postedDate: '2026-05-15',
        description: 'Some description',
        estimatedValue: { low: 1000000, high: 5000000 },
      },
    };

    const result = mapGovTribeOpportunity(raw);
    expect(result).not.toBeNull();
    expect(result!.opportunity.external_id).toBe('legacy-001');
    expect(result!.opportunity.title).toBe('Legacy Opp');
    expect(result!.opportunity.agency).toBe('DoD');
    expect(result!.opportunity.value_min).toBe(1000000);
    expect(result!.opportunity.value_max).toBe(5000000);
  });

  it('returns null for missing ID', () => {
    const raw: GovTribeOpportunityRaw = { attributes: { title: 'No ID' } };
    expect(mapGovTribeOpportunity(raw)).toBeNull();
  });

  it('uses govtribe_id field if present', () => {
    const raw: GovTribeOpportunityRaw = {
      govtribe_id: 'gt-001',
      attributes: { title: 'Test' },
    };
    const result = mapGovTribeOpportunity(raw);
    expect(result!.govtribe_id).toBe('gt-001');
  });
});
