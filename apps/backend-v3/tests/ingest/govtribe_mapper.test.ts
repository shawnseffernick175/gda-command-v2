import { describe, it, expect } from 'vitest';
import { mapGovTribeDetail, mapGovTribeOpportunity, mapGovTribeAward, mapGovTribeForecast } from '../../src/ingest/govtribe/mapper.js';
import type { GovTribeDetailRecord, GovTribeOpportunityRaw, GovTribeAwardDetail, GovTribeForecastDetail } from '../../src/ingest/govtribe/types.js';

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

describe('mapGovTribeAward', () => {
  const fullAward: GovTribeAwardDetail = {
    govtribe_id: 'award-001',
    govtribe_url: 'https://govtribe.com/award/award-001',
    name: 'SETA Support Contract',
    contract_number: 'W15QKN-25-C-0001',
    award_date: '2026-03-15',
    completion_date: '2031-03-14',
    ceiling_value: 50000000,
    dollars_obligated: 10000000,
    contract_type: 'Cost Plus Award Fee',
    set_aside_type: 'Total Small Business',
    extent_competed: 'Full and Open Competition',
    descriptions: ['SETA support for PEO IEW&S.'],
    awardee: { govtribe_id: 'v-001', name: 'Envision Inc', uei: 'ABC123' },
    contracting_federal_agency: { name: 'Department of the Army', sub_tier: 'PEO IEW&S' },
    naics_category: { code: '541511' },
  };

  it('maps all award fields', () => {
    const result = mapGovTribeAward(fullAward);
    expect(result).not.toBeNull();
    expect(result!.govtribe_id).toBe('award-001');
    expect(result!.title).toBe('SETA Support Contract');
    expect(result!.agency).toBe('Department of the Army');
    expect(result!.awardee).toBe('Envision Inc');
    expect(result!.awardee_uei).toBe('ABC123');
    expect(result!.contract_number).toBe('W15QKN-25-C-0001');
    expect(result!.ceiling_value).toBe(50000000);
    expect(result!.dollars_obligated).toBe(10000000);
    expect(result!.naics).toBe('541511');
    expect(result!.set_aside).toBe('Total Small Business');
  });

  it('returns null for missing govtribe_id', () => {
    const bad = { ...fullAward, govtribe_id: '' };
    expect(mapGovTribeAward(bad)).toBeNull();
  });

  it('handles minimal award (ID only)', () => {
    const minimal: GovTribeAwardDetail = { govtribe_id: 'min-award' };
    const result = mapGovTribeAward(minimal);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Untitled GovTribe Award');
    expect(result!.agency).toBeNull();
    expect(result!.awardee).toBeNull();
  });
});

describe('mapGovTribeForecast', () => {
  const fullForecast: GovTribeForecastDetail = {
    govtribe_id: 'forecast-001',
    govtribe_url: 'https://govtribe.com/forecast/forecast-001',
    name: 'Next Gen ISR Support',
    forecast_type: 'Presolicitation',
    set_aside: 'Total Small Business',
    estimated_solicitation_release_date: '2026-09-01',
    estimated_award_start_date: '2027-01-15',
    estimated_award_value: { low: 5000000, high: 25000000 },
    descriptions: ['Pre-RFP for ISR modernization.'],
    federal_agency: { name: 'Department of the Army' },
  };

  it('maps all forecast fields', () => {
    const result = mapGovTribeForecast(fullForecast);
    expect(result).not.toBeNull();
    expect(result!.govtribe_id).toBe('forecast-001');
    expect(result!.title).toBe('Next Gen ISR Support');
    expect(result!.agency).toBe('Department of the Army');
    expect(result!.forecast_type).toBe('Presolicitation');
    expect(result!.set_aside).toBe('Total Small Business');
    expect(result!.estimated_solicitation_date).toBe('2026-09-01');
    expect(result!.estimated_award_date).toBe('2027-01-15');
    expect(result!.estimated_value_low).toBe(5000000);
    expect(result!.estimated_value_high).toBe(25000000);
  });

  it('handles scalar estimated_award_value', () => {
    const detail: GovTribeForecastDetail = {
      govtribe_id: 'fc-scalar',
      estimated_award_value: 15000000,
    };
    const result = mapGovTribeForecast(detail);
    expect(result!.estimated_value_low).toBe(15000000);
    expect(result!.estimated_value_high).toBe(15000000);
  });

  it('returns null for missing govtribe_id', () => {
    const bad = { ...fullForecast, govtribe_id: '' };
    expect(mapGovTribeForecast(bad)).toBeNull();
  });

  it('handles minimal forecast (ID only)', () => {
    const minimal: GovTribeForecastDetail = { govtribe_id: 'min-fc' };
    const result = mapGovTribeForecast(minimal);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Untitled GovTribe Forecast');
    expect(result!.agency).toBeNull();
    expect(result!.estimated_value_low).toBeNull();
  });
});
