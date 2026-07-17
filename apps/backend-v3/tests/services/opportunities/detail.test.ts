/**
 * Unit tests for the unified opportunity detail builder (F-410).
 *
 * Covers:
 *   - null when unified row missing
 *   - merged_fields carries value + provenance source
 *   - sources[] returns raw per-source records
 *   - conflicts[] flags fields where >=2 sources hold differing non-null values
 *   - no conflict when sources agree, or only one source has the value
 *   - lineage[] mirrors the link rows with match metadata
 *   - pwin / doctrine_status come straight from the unified row
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock pool (same pattern as merge.test.ts) ───────────────────────────────

type QueryRow = Record<string, unknown>;

let queryResults: Array<{ fragment: string; rows: QueryRow[] }>;

function resetMock(): void {
  queryResults = [];
}

function onQuery(sqlFragment: string, rows: QueryRow[]): void {
  queryResults.push({ fragment: sqlFragment, rows });
}

const mockPool = {
  query: vi.fn(async (sql: string, _params?: unknown[]) => {
    for (const { fragment, rows } of queryResults) {
      if (sql.includes(fragment)) {
        return { rows, rowCount: rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  }),
};

// ─── Import under test ──────────────────────────────────────────────────────

import {
  getUnifiedOpportunityDetail,
  resolvePrimaryOpportunityId,
} from '../../../src/services/opportunities/detail.js';
import { clearMergeCache } from '../../../src/services/opportunities/merge.js';
import type pg from 'pg';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function unifiedRow(overrides: Partial<QueryRow> = {}): QueryRow {
  return {
    internal_id: 'uuid-410',
    lifecycle_stage: 'solicitation',
    primary_source: 'sam',
    pwin: 73,
    doctrine_status: 'qualified',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

function link(source: string, nativeId: string): QueryRow {
  return {
    id: Math.floor(Math.random() * 100000),
    internal_id: 'uuid-410',
    source,
    source_native_id: nativeId,
    confidence: 'HIGH',
    match_method: 'exact_notice_id',
    matched_at: '2026-01-01T12:00:00Z',
    confirmed_by: null,
    confirmed_at: null,
  };
}

// SAM source record (matches the SELECT in fetchSourceRecords for 'sam').
function samSrc(overrides: Partial<QueryRow> = {}): QueryRow {
  return {
    title: 'SAM Title',
    agency: 'Navy',
    office: null,
    naics: '541512',
    psc: 'D307',
    set_aside: 'SDVOSB',
    estimated_value_cents: 1000000,
    posted_at: '2026-01-01T00:00:00Z',
    response_due_at: '2026-02-01T00:00:00Z',
    award_at: null,
    ...overrides,
  };
}

function govwinSrc(overrides: Partial<QueryRow> = {}): QueryRow {
  return {
    title: 'GovWin Title',
    agency: 'Navy',
    office: null,
    naics: '541512',
    psc: null,
    set_aside: null,
    estimated_value_cents: 2000000,
    posted_at: '2025-12-15T00:00:00Z',
    response_due_at: '2026-02-05T00:00:00Z',
    award_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetMock();
  clearMergeCache();
  mockPool.query.mockClear();
});

describe('getUnifiedOpportunityDetail (F-410)', () => {
  it('returns null when no unified row exists', async () => {
    onQuery('FROM unified_opportunities WHERE internal_id', []);
    const result = await getUnifiedOpportunityDetail(
      mockPool as unknown as pg.Pool,
      'missing',
    );
    expect(result).toBeNull();
  });

  it('builds merged_fields with value + provenance source', async () => {
    onQuery('FROM unified_opportunities WHERE internal_id', [unifiedRow()]);
    onQuery('FROM unified_opportunity_links WHERE internal_id', [link('sam', 'N-1')]);
    onQuery('FROM unified_opportunity_field_overrides WHERE internal_id', []);
    onQuery("data_source IN ('sam.gov', 'sam_gov')", [samSrc()]);

    const result = await getUnifiedOpportunityDetail(
      mockPool as unknown as pg.Pool,
      'uuid-410',
    );

    expect(result).not.toBeNull();
    expect(result!.merged_fields.title.value).toBe('SAM Title');
    expect(result!.merged_fields.title.source).toBe('sam');
    expect(result!.merged_fields.naics.value).toBe('541512');
    expect(result!.merged_fields.naics.source).toBe('sam');
  });

  it('returns raw per-source records in sources[]', async () => {
    onQuery('FROM unified_opportunities WHERE internal_id', [unifiedRow()]);
    onQuery('FROM unified_opportunity_links WHERE internal_id', [
      link('sam', 'N-1'),
      link('govwin', 'G-1'),
    ]);
    onQuery('FROM unified_opportunity_field_overrides WHERE internal_id', []);
    onQuery("data_source IN ('sam.gov', 'sam_gov')", [samSrc()]);
    // govwin uses sam_notice_id = 'govwin-' || id, no data_source filter
    onQuery('WHERE sam_notice_id = $1\n           LIMIT 1', [govwinSrc()]);

    const result = await getUnifiedOpportunityDetail(
      mockPool as unknown as pg.Pool,
      'uuid-410',
    );

    const srcNames = result!.sources.map((s) => s.source).sort();
    expect(srcNames).toEqual(['govwin', 'sam']);
  });

  it('flags conflicts when two sources disagree on a non-null field', async () => {
    onQuery('FROM unified_opportunities WHERE internal_id', [unifiedRow()]);
    onQuery('FROM unified_opportunity_links WHERE internal_id', [
      link('sam', 'N-1'),
      link('govwin', 'G-1'),
    ]);
    onQuery('FROM unified_opportunity_field_overrides WHERE internal_id', []);
    onQuery("data_source IN ('sam.gov', 'sam_gov')", [samSrc({ title: 'SAM Title' })]);
    onQuery('WHERE sam_notice_id = $1\n           LIMIT 1', [govwinSrc({ title: 'GovWin Title' })]);

    const result = await getUnifiedOpportunityDetail(
      mockPool as unknown as pg.Pool,
      'uuid-410',
    );

    const titleConflict = result!.conflicts.find((c) => c.field === 'title');
    expect(titleConflict).toBeDefined();
    expect(titleConflict!.values).toHaveLength(2);
    // GovWin wins title precedence (govwin > sam in SOURCE_PRECEDENCE).
    expect(titleConflict!.chosen).toBe('govwin');

    // agency is identical across both → no conflict
    expect(result!.conflicts.find((c) => c.field === 'agency')).toBeUndefined();
  });

  it('does not flag a conflict when only one source has the value', async () => {
    onQuery('FROM unified_opportunities WHERE internal_id', [unifiedRow()]);
    onQuery('FROM unified_opportunity_links WHERE internal_id', [
      link('sam', 'N-1'),
      link('govwin', 'G-1'),
    ]);
    onQuery('FROM unified_opportunity_field_overrides WHERE internal_id', []);
    onQuery("data_source IN ('sam.gov', 'sam_gov')", [samSrc({ psc: 'D307' })]);
    onQuery('WHERE sam_notice_id = $1\n           LIMIT 1', [govwinSrc({ psc: null })]);

    const result = await getUnifiedOpportunityDetail(
      mockPool as unknown as pg.Pool,
      'uuid-410',
    );

    expect(result!.conflicts.find((c) => c.field === 'psc')).toBeUndefined();
  });

  it('mirrors links into lineage[] with match metadata', async () => {
    onQuery('FROM unified_opportunities WHERE internal_id', [unifiedRow()]);
    onQuery('FROM unified_opportunity_links WHERE internal_id', [link('sam', 'N-1')]);
    onQuery('FROM unified_opportunity_field_overrides WHERE internal_id', []);
    onQuery("data_source IN ('sam.gov', 'sam_gov')", [samSrc()]);

    const result = await getUnifiedOpportunityDetail(
      mockPool as unknown as pg.Pool,
      'uuid-410',
    );

    expect(result!.lineage).toHaveLength(1);
    expect(result!.lineage[0].source).toBe('sam');
    expect(result!.lineage[0].source_native_id).toBe('N-1');
    expect(result!.lineage[0].confidence).toBe('HIGH');
    expect(result!.lineage[0].match_method).toBe('exact_notice_id');
  });

  it('carries pwin and doctrine_status straight from the unified row', async () => {
    onQuery('FROM unified_opportunities WHERE internal_id', [
      unifiedRow({ pwin: 88, doctrine_status: 'excluded' }),
    ]);
    onQuery('FROM unified_opportunity_links WHERE internal_id', [link('sam', 'N-1')]);
    onQuery('FROM unified_opportunity_field_overrides WHERE internal_id', []);
    onQuery("data_source IN ('sam.gov', 'sam_gov')", [samSrc()]);

    const result = await getUnifiedOpportunityDetail(
      mockPool as unknown as pg.Pool,
      'uuid-410',
    );

    expect(result!.pwin).toBe(88);
    expect(result!.doctrine_status).toBe('excluded');
    expect(result!.lifecycle_stage).toBe('solicitation');
    expect(result!.primary_source).toBe('sam');
  });
});

// ─── F-420a (R1): per-field source provenance links ─────────────────────────

describe('merged_fields source provenance (F-420a R1)', () => {
  it('attaches a clickable SAM SourceRef to fields sourced from sam', async () => {
    onQuery('FROM unified_opportunities WHERE internal_id', [unifiedRow()]);
    onQuery('FROM unified_opportunity_links WHERE internal_id', [link('sam', 'N-1')]);
    onQuery('FROM unified_opportunity_field_overrides WHERE internal_id', []);
    onQuery("data_source IN ('sam.gov', 'sam_gov')", [samSrc()]);

    const result = await getUnifiedOpportunityDetail(
      mockPool as unknown as pg.Pool,
      'uuid-410',
    );

    const titleSources = result!.merged_fields.title.sources;
    expect(titleSources).toHaveLength(1);
    expect(titleSources[0].kind).toBe('sam_gov');
    expect(titleSources[0].title).toBe('SAM.gov');
    expect(titleSources[0].url).toBe('https://sam.gov/opp/N-1/view');
    expect(typeof titleSources[0].retrieved_at).toBe('string');
  });

  it('returns no SourceRef for fast_track (no addressable URL)', async () => {
    onQuery('FROM unified_opportunities WHERE internal_id', [
      unifiedRow({ primary_source: 'fast_track' }),
    ]);
    onQuery('FROM unified_opportunity_links WHERE internal_id', [
      link('fast_track', 'FT-1'),
    ]);
    onQuery('FROM unified_opportunity_field_overrides WHERE internal_id', []);
    onQuery('FROM fast_track_assessments', [
      { title: 'FT Title', agency: null, office: null, naics: '541512', psc: null,
        set_aside: null, estimated_value_cents: null, posted_at: null,
        response_due_at: null, award_at: null },
    ]);

    const result = await getUnifiedOpportunityDetail(
      mockPool as unknown as pg.Pool,
      'uuid-410',
    );

    expect(result!.merged_fields.title.sources).toEqual([]);
  });
});

// ─── F-420a (R2): resolve underlying opportunities.id for analysis ──────────

describe('resolvePrimaryOpportunityId (F-420a R2)', () => {
  it('resolves the sam opportunities.id via primary-source link', async () => {
    onQuery('FROM unified_opportunities WHERE internal_id', [unifiedRow()]);
    onQuery('FROM unified_opportunity_links WHERE internal_id', [link('sam', 'N-1')]);
    onQuery('FROM unified_opportunity_field_overrides WHERE internal_id', []);
    onQuery("data_source IN ('sam.gov', 'sam_gov')", [samSrc()]);

    const detail = await getUnifiedOpportunityDetail(
      mockPool as unknown as pg.Pool,
      'uuid-410',
    );

    // Reset registrations so the resolver's id-lookup fragment is matched
    // first (the mock returns the first registered fragment that matches).
    resetMock();
    onQuery("SELECT id FROM opportunities WHERE sam_notice_id = $1 AND data_source = 'sam_gov'", [
      { id: 'opp-uuid-1' },
    ]);

    const oppId = await resolvePrimaryOpportunityId(
      mockPool as unknown as pg.Pool,
      detail!,
    );
    expect(oppId).toBe('opp-uuid-1');
  });

  it('returns null when the only source is fast_track (not analyzable)', async () => {
    onQuery('FROM unified_opportunities WHERE internal_id', [
      unifiedRow({ primary_source: 'fast_track' }),
    ]);
    onQuery('FROM unified_opportunity_links WHERE internal_id', [
      link('fast_track', 'FT-1'),
    ]);
    onQuery('FROM unified_opportunity_field_overrides WHERE internal_id', []);
    onQuery('FROM fast_track_assessments', [
      { title: 'FT Title', agency: null, office: null, naics: '541512', psc: null,
        set_aside: null, estimated_value_cents: null, posted_at: null,
        response_due_at: null, award_at: null },
    ]);

    const detail = await getUnifiedOpportunityDetail(
      mockPool as unknown as pg.Pool,
      'uuid-410',
    );

    const oppId = await resolvePrimaryOpportunityId(
      mockPool as unknown as pg.Pool,
      detail!,
    );
    expect(oppId).toBeNull();
  });
});
