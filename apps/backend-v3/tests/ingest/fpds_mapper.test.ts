import { describe, it, expect } from 'vitest';
import { mapFPDSAward } from '../../src/ingest/fpds/mapper.js';
import type { FPDSAwardRaw } from '../../src/ingest/fpds/parser.js';

function makeRaw(overrides: Partial<FPDSAwardRaw> = {}): FPDSAwardRaw {
  return {
    piid: 'W912DY26C0042',
    agencyId: '021',
    agencyName: 'DEPT OF THE ARMY',
    contractingOffice: 'US ARMY CORPS OF ENGINEERS',
    awardeeName: 'ACME DEFENSE SOLUTIONS LLC',
    awardeeUEI: 'XNMLXFMQD976',
    awardeeDUNS: '123456789',
    obligatedAmount: 4500000,
    baseAndAllOptionsValue: 12000000,
    naicsCode: '541330',
    pscCode: 'R425',
    setAside: 'Total Small Business Set-Aside',
    placeOfPerformanceState: 'NC',
    placeOfPerformanceCountry: 'USA',
    signedDate: '2026-05-15',
    lastModDate: '2026-05-28',
    contractType: 'Firm Fixed Price',
    parentAwardId: 'W912DY20D0099',
    solicitationId: 'W912DY-26-R-0001',
    fpdsUrl: 'https://www.fpds.gov/ezsearch/search.do?q=W912DY26C0042',
    ...overrides,
  };
}

describe('mapFPDSAward', () => {
  it('maps all core fields from a standard award', () => {
    const { award } = mapFPDSAward(makeRaw());

    expect(award.piid).toBe('W912DY26C0042');
    expect(award.agency_id).toBe('021');
    expect(award.agency_name).toBe('DEPT OF THE ARMY');
    expect(award.contracting_office).toBe('US ARMY CORPS OF ENGINEERS');
    expect(award.awardee_name).toBe('ACME DEFENSE SOLUTIONS LLC');
    expect(award.awardee_uei).toBe('XNMLXFMQD976');
    expect(award.awardee_duns).toBe('123456789');
    expect(award.value_obligated).toBe(4500000);
    expect(award.value_base_and_all_options).toBe(12000000);
    expect(award.naics).toBe('541330');
    expect(award.psc).toBe('R425');
    expect(award.set_aside).toBe('Total Small Business Set-Aside');
    expect(award.place_of_performance_state).toBe('NC');
    expect(award.place_of_performance_country).toBe('USA');
    expect(award.award_date).toBe('2026-05-15');
    expect(award.last_mod_date).toBe('2026-05-28');
    expect(award.contract_type).toBe('Firm Fixed Price');
    expect(award.parent_award_id).toBe('W912DY20D0099');
    expect(award.sam_notice_id).toBe('W912DY-26-R-0001');
    expect(award.data_source).toBe('fpds.gov');
    expect(award.fpds_url).toContain('fpds.gov');
  });

  it('generates per-field source citations (R1)', () => {
    const { citations } = mapFPDSAward(makeRaw());
    const fields = citations.map((c) => c.field);

    expect(fields).toContain('awardee');
    expect(fields).toContain('value');
    expect(fields).toContain('naics');
    expect(fields).toContain('award_date');
    expect(fields).toContain('agency');
    expect(citations).toHaveLength(5);

    for (const c of citations) {
      expect(c.source_url).toContain('fpds.gov');
    }
  });

  it('maps a modification (same PIID, different values)', () => {
    const { award } = mapFPDSAward(makeRaw({
      obligatedAmount: 6500000,
      baseAndAllOptionsValue: 15000000,
      signedDate: '2026-05-29',
      lastModDate: '2026-05-30',
    }));

    expect(award.piid).toBe('W912DY26C0042');
    expect(award.value_obligated).toBe(6500000);
    expect(award.value_base_and_all_options).toBe(15000000);
    expect(award.award_date).toBe('2026-05-29');
    expect(award.last_mod_date).toBe('2026-05-30');
  });

  it('maps an IDV vehicle with no parent', () => {
    const { award } = mapFPDSAward(makeRaw({
      piid: 'GS35F0222Y',
      parentAwardId: null,
      solicitationId: null,
    }));

    expect(award.piid).toBe('GS35F0222Y');
    expect(award.parent_award_id).toBeNull();
    expect(award.sam_notice_id).toBeNull();
  });

  it('maps a set-aside award', () => {
    const { award } = mapFPDSAward(makeRaw({
      setAside: 'HUBZone Set-Aside',
    }));

    expect(award.set_aside).toBe('HUBZone Set-Aside');
  });

  it('handles blank UEI', () => {
    const { award, citations } = mapFPDSAward(makeRaw({
      awardeeUEI: null,
      awardeeDUNS: '555444333',
    }));

    expect(award.awardee_uei).toBeNull();
    expect(award.awardee_duns).toBe('555444333');
    expect(award.awardee_name).toBe('ACME DEFENSE SOLUTIONS LLC');

    const fields = citations.map((c) => c.field);
    expect(fields).toContain('awardee');
  });

  it('handles all-null optional fields', () => {
    const { award, citations } = mapFPDSAward(makeRaw({
      agencyId: null,
      agencyName: null,
      contractingOffice: null,
      awardeeName: null,
      awardeeUEI: null,
      awardeeDUNS: null,
      obligatedAmount: null,
      baseAndAllOptionsValue: null,
      naicsCode: null,
      pscCode: null,
      setAside: null,
      placeOfPerformanceState: null,
      placeOfPerformanceCountry: null,
      signedDate: null,
      contractType: null,
      parentAwardId: null,
      solicitationId: null,
    }));

    expect(award.agency_id).toBeNull();
    expect(award.awardee_name).toBeNull();
    expect(award.value_obligated).toBeNull();
    expect(award.naics).toBeNull();
    expect(award.award_date).toBeNull();

    expect(citations).toHaveLength(0);
  });

  it('builds fallback FPDS URL when fpdsUrl is null', () => {
    const { award } = mapFPDSAward(makeRaw({ fpdsUrl: null }));

    expect(award.fpds_url).toContain('PIID');
    expect(award.fpds_url).toContain('W912DY26C0042');
  });
});
