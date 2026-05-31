import { describe, it, expect } from 'vitest';
import { mapSBIRAward } from '../../src/ingest/sbir/mapper_awards.js';
import type { SBIRAwardRaw } from '../../src/ingest/sbir/client.js';
import phase1 from '../fixtures/sbir/phase1_sbir_award.json';
import phase2 from '../fixtures/sbir/phase2_sbir_award.json';
import phase3 from '../fixtures/sbir/phase3_sbir_award.json';
import sttrRi from '../fixtures/sbir/sttr_with_ri.json';
import missingOptional from '../fixtures/sbir/missing_optional_fields.json';
import malformedDates from '../fixtures/sbir/malformed_dates.json';

function asRaw(fixture: Record<string, unknown>): SBIRAwardRaw {
  return fixture as unknown as SBIRAwardRaw;
}

describe('mapSBIRAward', () => {
  it('maps a Phase I SBIR award with all core fields', () => {
    const result = mapSBIRAward(asRaw(phase1));
    expect(result).not.toBeNull();
    const { award } = result!;

    expect(award.award_number).toBe('N68335-26-C-0042');
    expect(award.program).toBe('SBIR');
    expect(award.phase).toBe('Phase I');
    expect(award.award_year).toBe(2026);
    expect(award.agency).toBe('DOD');
    expect(award.branch).toBe('Navy');
    expect(award.awardee_name).toBe('ACME MARITIME SYSTEMS LLC');
    expect(award.awardee_uei).toBe('XNMLXFMQD976');
    expect(award.awardee_duns).toBe('123456789');
    expect(award.awardee_city).toBe('Annapolis');
    expect(award.awardee_state).toBe('MD');
    expect(award.pi_name).toBe('Dr. James Reynolds');
    expect(award.research_institution).toBeNull();
    expect(award.title).toBe('Advanced Autonomous Underwater Vehicle Navigation System');
    expect(award.award_amount).toBe(275000);
    expect(award.topic_code).toBe('N26A-T001');
    expect(award.award_start_date).toBe('2026-04-01');
    expect(award.award_end_date).toBe('2026-10-01');
    expect(award.sbir_url).toBe('https://www.sbir.gov/award/1234567');
  });

  it('maps a Phase II SBIR award', () => {
    const result = mapSBIRAward(asRaw(phase2));
    expect(result).not.toBeNull();
    const { award } = result!;

    expect(award.award_number).toBe('FA8650-25-C-1234');
    expect(award.program).toBe('SBIR');
    expect(award.phase).toBe('Phase II');
    expect(award.award_year).toBe(2025);
    expect(award.branch).toBe('Air Force');
    expect(award.award_amount).toBe(1750000);
    expect(award.awardee_duns).toBeNull();
  });

  it('maps a Phase III SBIR award', () => {
    const result = mapSBIRAward(asRaw(phase3));
    expect(result).not.toBeNull();
    const { award } = result!;

    expect(award.award_number).toBe('W56HZV-26-C-0789');
    expect(award.phase).toBe('Phase III');
    expect(award.branch).toBe('Army');
    expect(award.award_amount).toBe(12500000);
    expect(award.proposal_number).toBeNull();
  });

  it('maps STTR award with research_institution populated', () => {
    const result = mapSBIRAward(asRaw(sttrRi));
    expect(result).not.toBeNull();
    const { award } = result!;

    expect(award.program).toBe('STTR');
    expect(award.research_institution).toBe('Massachusetts Institute of Technology');
    expect(award.branch).toBe('Army');
    expect(award.award_amount).toBe(300000);
  });

  it('generates per-field source citations (R1)', () => {
    const result = mapSBIRAward(asRaw(phase1));
    expect(result).not.toBeNull();
    const { citations } = result!;
    const fields = citations.map((c) => c.field);

    expect(fields).toContain('awardee');
    expect(fields).toContain('amount');
    expect(fields).toContain('topic');
    expect(citations).toHaveLength(3);

    for (const c of citations) {
      expect(c.source_url).toContain('sbir.gov');
    }
  });

  it('handles missing optional fields gracefully', () => {
    const result = mapSBIRAward(asRaw(missingOptional));
    expect(result).not.toBeNull();
    const { award, citations } = result!;

    expect(award.award_number).toBe('DARPA-26-C-0099');
    expect(award.branch).toBe('DARPA');
    expect(award.awardee_uei).toBeNull();
    expect(award.awardee_duns).toBeNull();
    expect(award.awardee_city).toBeNull();
    expect(award.pi_name).toBeNull();
    expect(award.award_amount).toBeNull();
    expect(award.contract_number).toBeNull();
    expect(award.topic_code).toBeNull();
    expect(award.award_start_date).toBeNull();
    expect(award.award_end_date).toBeNull();

    const fields = citations.map((c) => c.field);
    expect(fields).toContain('awardee');
    expect(fields).not.toContain('amount');
    expect(fields).not.toContain('topic');
  });

  it('handles malformed dates without crashing', () => {
    const result = mapSBIRAward(asRaw(malformedDates));
    expect(result).not.toBeNull();
    const { award } = result!;

    expect(award.award_number).toBe('N00014-26-C-0555');
    expect(award.award_start_date).toBeNull();
    expect(award.award_end_date).toBeNull();
    expect(award.award_amount).toBe(1100000);
    expect(award.branch).toBe('Navy');
  });

  it('returns null for records with no award_number', () => {
    const raw = { ...phase1, award_number: null } as unknown as SBIRAwardRaw;
    const result = mapSBIRAward(raw);
    expect(result).toBeNull();
  });

  it('returns null for records with empty award_number', () => {
    const raw = { ...phase1, award_number: '' } as unknown as SBIRAwardRaw;
    const result = mapSBIRAward(raw);
    expect(result).toBeNull();
  });

  it('returns null for records with no firm name', () => {
    const raw = { ...phase1, firm: null } as unknown as SBIRAwardRaw;
    const result = mapSBIRAward(raw);
    expect(result).toBeNull();
  });

  it('returns null for records with no title', () => {
    const raw = { ...phase1, award_title: null } as unknown as SBIRAwardRaw;
    const result = mapSBIRAward(raw);
    expect(result).toBeNull();
  });

  it('generates a fallback sbir_url when none provided', () => {
    const result = mapSBIRAward(asRaw(missingOptional));
    expect(result).not.toBeNull();
    expect(result!.award.sbir_url).toContain('sbir.gov');
  });

  it('parses DARPA branch correctly', () => {
    const result = mapSBIRAward(asRaw(missingOptional));
    expect(result).not.toBeNull();
    expect(result!.award.branch).toBe('DARPA');
  });

  it('parses Air Force branch from AFWERX-like branch text', () => {
    const raw = { ...phase1, branch: 'AFWERX' } as unknown as SBIRAwardRaw;
    const result = mapSBIRAward(raw);
    expect(result).not.toBeNull();
    expect(result!.award.branch).toBe('Air Force');
  });
});
