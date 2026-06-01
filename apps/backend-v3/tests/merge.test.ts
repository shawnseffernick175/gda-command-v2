/**
 * F-405: Unit tests for field merge precedence.
 *
 * Tests the pure buildMergedOpportunity function and its helpers
 * without any DB dependency.
 */

import { describe, it, expect } from 'vitest';
import {
  buildMergedOpportunity,
  mergeFirstNonNull,
  mergeNumeric,
  SOURCE_PRECEDENCE,
  type OpportunityLink,
  type FieldOverride,
} from '../src/services/opportunities/merge.js';
import type { OpportunityRow } from '../src/services/opportunities/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    id: '100',
    title: 'Base Title',
    agency: 'Base Agency',
    sub_agency: null,
    solicitation_number: null,
    sam_notice_id: null,
    status: 'discovery',
    grade: null,
    grade_evidence: null,
    value_min: null,
    value_max: 5000000,
    naics: '541330',
    psc: null,
    set_aside: 'SDB',
    place_of_performance: null,
    response_due_at: '2026-09-01T00:00:00Z',
    posted_at: '2026-06-01T00:00:00Z',
    incumbent: null,
    description: 'Base description',
    tags: [],
    data_source: 'manual',
    analysis: null,
    analysis_version: null,
    ai_analyzed_at: null,
    qualified_at: null,
    qualified_by: null,
    source_id: '1',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function makeLink(
  sourceType: 'govwin' | 'sam' | 'govtribe' | 'fast_track',
  snapshot: Record<string, unknown>,
): OpportunityLink {
  return {
    id: `link-${sourceType}`,
    opportunity_id: '100',
    source_type: sourceType,
    source_record_id: `${sourceType}-001`,
    snapshot,
    linked_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  };
}

function makeOverride(
  fieldName: string,
  fieldValue: string | null,
): FieldOverride {
  return {
    id: `override-${fieldName}`,
    opportunity_id: '100',
    field_name: fieldName,
    field_value: fieldValue,
    set_by: 'shawn@envision.test',
    set_at: '2026-06-01T12:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('F-405: Field merge precedence', () => {

  describe('mergeFirstNonNull', () => {
    it('returns override when present', () => {
      const links = [makeLink('govwin', { title: 'GovWin Title' })];
      const overrides = new Map([['title', makeOverride('title', 'Human Title')]]);

      const result = mergeFirstNonNull(links, 'title', SOURCE_PRECEDENCE, overrides, 'Base');
      expect(result.value).toBe('Human Title');
      expect(result.source).toBe('override');
    });

    it('walks precedence stack when no override', () => {
      const links = [
        makeLink('govtribe', { title: 'GovTribe Title' }),
        makeLink('govwin', { title: 'GovWin Title' }),
      ];
      const overrides = new Map<string, FieldOverride>();

      const result = mergeFirstNonNull(links, 'title', SOURCE_PRECEDENCE, overrides, 'Base');
      expect(result.value).toBe('GovWin Title');
      expect(result.source).toBe('govwin');
    });

    it('skips null values in higher-precedence sources', () => {
      const links = [
        makeLink('govwin', { title: null }),
        makeLink('sam', { title: 'SAM Title' }),
      ];
      const overrides = new Map<string, FieldOverride>();

      const result = mergeFirstNonNull(links, 'title', SOURCE_PRECEDENCE, overrides, 'Base');
      expect(result.value).toBe('SAM Title');
      expect(result.source).toBe('sam');
    });

    it('falls back to base when no source has the field', () => {
      const links = [
        makeLink('govwin', {}),
        makeLink('sam', {}),
      ];
      const overrides = new Map<string, FieldOverride>();

      const result = mergeFirstNonNull(links, 'title', SOURCE_PRECEDENCE, overrides, 'Base Title');
      expect(result.value).toBe('Base Title');
      expect(result.source).toBe('base');
    });
  });

  describe('mergeNumeric', () => {
    it('returns override as number', () => {
      const links = [makeLink('govwin', { estimated_value_cents: 1000000 })];
      const overrides = new Map([
        ['estimated_value_cents', makeOverride('estimated_value_cents', '2000000')],
      ]);

      const result = mergeNumeric(links, 'estimated_value_cents', SOURCE_PRECEDENCE, overrides, null);
      expect(result.value).toBe(2000000);
      expect(result.source).toBe('override');
    });

    it('uses custom value precedence (GovWin > SAM > GovTribe)', () => {
      const links = [
        makeLink('sam', { estimated_value_cents: 3000000 }),
        makeLink('govtribe', { estimated_value_cents: 4000000 }),
      ];
      const overrides = new Map<string, FieldOverride>();

      // GovWin not present, should fall to SAM
      const result = mergeNumeric(
        links, 'estimated_value_cents',
        ['govwin', 'sam', 'govtribe'],
        overrides, null,
      );
      expect(result.value).toBe(3000000);
      expect(result.source).toBe('sam');
    });
  });

  describe('buildMergedOpportunity', () => {
    it('produces correct merged view with GovWin + SAM + GovTribe', () => {
      const row = makeRow();
      const links = [
        makeLink('govwin', {
          title: 'GovWin Opportunity Title',
          agency: 'Department of Defense',
          estimated_value_cents: 10000000,
          response_due_at: '2026-10-01T00:00:00Z',
        }),
        makeLink('sam', {
          title: 'SAM Title',
          agency: 'Department of Defense',
          estimated_value_cents: 9000000,
          response_due_at: '2026-09-15T00:00:00Z',
        }),
        makeLink('govtribe', {
          title: 'GovTribe Title',
          agency: null,
          estimated_value_cents: 8000000,
          response_due_at: '2026-09-20T00:00:00Z',
        }),
      ];

      const merged = buildMergedOpportunity(row, links, []);

      // title: GovWin wins (first non-null per default precedence)
      expect(merged.title.value).toBe('GovWin Opportunity Title');
      expect(merged.title.source).toBe('govwin');

      // agency: GovWin wins
      expect(merged.agency.value).toBe('Department of Defense');
      expect(merged.agency.source).toBe('govwin');

      // estimated_value_cents: GovWin > SAM > GovTribe
      expect(merged.estimated_value_cents.value).toBe(10000000);
      expect(merged.estimated_value_cents.source).toBe('govwin');

      // response_due_at: SAM > GovWin > GovTribe (SAM authoritative)
      expect(merged.response_due_at.value).toBe('2026-09-15T00:00:00Z');
      expect(merged.response_due_at.source).toBe('sam');
    });

    it('human override on agency beats all sources', () => {
      const row = makeRow();
      const links = [
        makeLink('govwin', { agency: 'GovWin Agency' }),
        makeLink('sam', { agency: 'SAM Agency' }),
      ];
      const overrides = [makeOverride('agency', 'Envision Override Agency')];

      const merged = buildMergedOpportunity(row, links, overrides);

      expect(merged.agency.value).toBe('Envision Override Agency');
      expect(merged.agency.source).toBe('override');
    });

    it('pwin is always computed, never merged from source', () => {
      const links = [
        makeLink('govwin', { pwin: 0.85 }),
        makeLink('sam', { pwin: 0.70 }),
      ];

      const merged = buildMergedOpportunity(makeRow(), links, []);

      expect(merged.pwin.value).toBeNull();
      expect(merged.pwin.source).toBe('base');
    });

    it('doctrine_status is always computed', () => {
      const links = [
        makeLink('govwin', { doctrine_status: 'approved' }),
      ];

      const merged = buildMergedOpportunity(makeRow(), links, []);

      expect(merged.doctrine_status.value).toBeNull();
      expect(merged.doctrine_status.source).toBe('base');
    });

    it('includes all linked sources and overrides in output', () => {
      const row = makeRow();
      const links = [
        makeLink('govwin', { title: 'GW' }),
        makeLink('sam', { title: 'SAM' }),
      ];
      const overrides = [makeOverride('agency', 'Override')];

      const merged = buildMergedOpportunity(row, links, overrides);

      expect(merged.links).toHaveLength(2);
      expect(merged.overrides).toHaveLength(1);
      expect(merged.internal_id).toBe('100');
      expect(merged.merged_at).toBeTruthy();
    });

    it('passes through base row fields', () => {
      const row = makeRow({
        naics: '541611',
        set_aside: 'HUBZone',
        status: 'tracking',
      });

      const merged = buildMergedOpportunity(row, [], []);

      expect(merged.naics).toBe('541611');
      expect(merged.set_aside).toBe('HUBZone');
      expect(merged.status).toBe('tracking');
    });

    it('response_due_at uses SAM > GovWin > GovTribe precedence', () => {
      const row = makeRow({ response_due_at: '2026-12-01T00:00:00Z' });

      // Only GovWin + GovTribe present, no SAM
      const links = [
        makeLink('govwin', { response_due_at: '2026-10-15T00:00:00Z' }),
        makeLink('govtribe', { response_due_at: '2026-11-01T00:00:00Z' }),
      ];

      const merged = buildMergedOpportunity(row, links, []);

      // SAM not present, GovWin next in due-date precedence
      expect(merged.response_due_at.value).toBe('2026-10-15T00:00:00Z');
      expect(merged.response_due_at.source).toBe('govwin');
    });

    it('estimated_value_cents skips Fast Track (unreliable)', () => {
      const row = makeRow({ value_max: 1000000 });
      const links = [
        makeLink('fast_track', { estimated_value_cents: 9999999 }),
      ];

      const merged = buildMergedOpportunity(row, links, []);

      // Fast Track is excluded from VALUE_PRECEDENCE, falls back to base
      expect(merged.estimated_value_cents.value).toBe(1000000);
      expect(merged.estimated_value_cents.source).toBe('base');
    });

    it('override with null value clears the field', () => {
      const row = makeRow({ agency: 'Original Agency' });
      const links = [makeLink('govwin', { agency: 'GovWin Agency' })];
      const overrides = [makeOverride('agency', null)];

      const merged = buildMergedOpportunity(row, links, overrides);

      expect(merged.agency.value).toBeNull();
      expect(merged.agency.source).toBe('override');
    });
  });
});
