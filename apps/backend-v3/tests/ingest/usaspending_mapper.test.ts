import { describe, it, expect } from 'vitest';
import { mapUSASpendingAward } from '../../src/ingest/usaspending/mapper.js';
import type { USASpendingAwardRaw } from '../../src/ingest/usaspending/client.js';
import standardAward from '../fixtures/usaspending/standard_award.json';
import modificationAward from '../fixtures/usaspending/modification.json';
import idvVehicle from '../fixtures/usaspending/idv_vehicle.json';
import missingOptional from '../fixtures/usaspending/missing_optional_fields.json';
import malformedDates from '../fixtures/usaspending/malformed_dates.json';

function asRaw(fixture: Record<string, unknown>): USASpendingAwardRaw {
  return fixture as unknown as USASpendingAwardRaw;
}

describe('mapUSASpendingAward', () => {
  it('maps all core fields from a standard DoD award', () => {
    const result = mapUSASpendingAward(asRaw(standardAward));
    expect(result).not.toBeNull();
    const { award } = result!;

    expect(award.piid).toBe('W912DY26C0042');
    expect(award.agency_name).toBe('Department of Defense');
    expect(award.agency_id).toBe('Department of the Army');
    expect(award.contracting_office).toBe('US ARMY CORPS OF ENGINEERS');
    expect(award.awardee_name).toBe('ACME DEFENSE SOLUTIONS LLC');
    expect(award.awardee_uei).toBe('XNMLXFMQD976');
    expect(award.awardee_duns).toBe('123456789');
    expect(award.value_obligated).toBe(4500000);
    expect(award.value_base_and_all_options).toBe(12000000);
    expect(award.naics).toBe('541330');
    expect(award.psc).toBe('R425');
    expect(award.place_of_performance_state).toBe('NC');
    expect(award.place_of_performance_country).toBe('USA');
    expect(award.award_date).toBe('2026-05-15');
    expect(award.last_mod_date).toBe('2026-05-28');
    expect(award.contract_type).toBe('Firm Fixed Price');
    expect(award.sam_notice_id).toBeNull();
    expect(award.data_source).toBe('usaspending');
    expect(award.fpds_url).toBe(
      'https://www.usaspending.gov/award/CONT_AWD_W912DY26C0042_2100_W912DY20D0099_2100',
    );
  });

  it('generates per-field source citations (R1)', () => {
    const result = mapUSASpendingAward(asRaw(standardAward));
    expect(result).not.toBeNull();
    const { citations } = result!;
    const fields = citations.map((c) => c.field);

    expect(fields).toContain('awardee');
    expect(fields).toContain('value');
    expect(fields).toContain('naics');
    expect(fields).toContain('award_date');
    expect(fields).toContain('agency');
    expect(citations).toHaveLength(5);

    for (const c of citations) {
      expect(c.source_url).toContain('usaspending.gov');
    }
  });

  it('maps a modification (same PIID, different last_mod_date)', () => {
    const result = mapUSASpendingAward(asRaw(modificationAward));
    expect(result).not.toBeNull();
    const { award } = result!;

    expect(award.piid).toBe('W912DY26C0042');
    expect(award.value_obligated).toBe(6500000);
    expect(award.value_base_and_all_options).toBe(15000000);
    expect(award.award_date).toBe('2026-05-15');
    expect(award.last_mod_date).toBe('2026-05-30');
  });

  it('maps an IDV vehicle (IDV_* award type code)', () => {
    const result = mapUSASpendingAward(asRaw(idvVehicle));
    expect(result).not.toBeNull();
    const { award } = result!;

    expect(award.piid).toBe('GS35F0222Y');
    expect(award.contract_type).toBe('IDV_B');
    expect(award.awardee_duns).toBeNull();
    expect(award.value_base_and_all_options).toBeNull();
    expect(award.sam_notice_id).toBeNull();
  });

  it('handles missing optional fields gracefully', () => {
    const result = mapUSASpendingAward(asRaw(missingOptional));
    expect(result).not.toBeNull();
    const { award, citations } = result!;

    expect(award.piid).toBe('FA862526P0001');
    expect(award.awardee_name).toBeNull();
    expect(award.awardee_uei).toBeNull();
    expect(award.awardee_duns).toBeNull();
    expect(award.value_obligated).toBeNull();
    expect(award.naics).toBeNull();
    expect(award.award_date).toBeNull();
    expect(award.agency_name).toBeNull();
    expect(award.fpds_url).toBe('https://www.usaspending.gov');

    expect(citations).toHaveLength(0);
  });

  it('handles malformed dates without crashing', () => {
    const result = mapUSASpendingAward(asRaw(malformedDates));
    expect(result).not.toBeNull();
    const { award } = result!;

    expect(award.piid).toBe('N0017826C0099');
    expect(award.award_date).toBeNull();
    expect(award.last_mod_date).toBeNull();
    expect(award.awardee_name).toBe('NORTHROP GRUMMAN SYSTEMS CORP');
    expect(award.value_obligated).toBe(8750000);
  });

  it('returns null for records with no Award ID', () => {
    const raw = { ...standardAward, 'Award ID': null } as unknown as USASpendingAwardRaw;
    const result = mapUSASpendingAward(raw);
    expect(result).toBeNull();
  });

  it('returns null for records with empty Award ID', () => {
    const raw = { ...standardAward, 'Award ID': '  ' } as unknown as USASpendingAwardRaw;
    const result = mapUSASpendingAward(raw);
    expect(result).toBeNull();
  });
});
