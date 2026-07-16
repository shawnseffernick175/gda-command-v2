/**
 * Unit tests for the merge service (F-405).
 *
 * Covers:
 *   - Precedence rules per field
 *   - Override beats every source
 *   - Null-handling per field
 *   - pwin/doctrine_status always from unified row
 *   - estimated_value_cents custom precedence (GovWin > SAM)
 *   - response_due_at custom precedence (SAM > GovWin)
 *   - posted_at earliest rule
 *   - Cache hit on second call (spy counter)
 *   - Cache invalidation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock pool ───────────────────────────────────────────────────────────────

type QueryRow = Record<string, unknown>;

let queryResults: Map<string, QueryRow[]>;
let queryCallCount: number;

function resetMock(): void {
  queryResults = new Map();
  queryCallCount = 0;
}

function setQueryResult(sqlFragment: string, rows: QueryRow[]): void {
  queryResults.set(sqlFragment, rows);
}

const mockPool = {
  query: vi.fn(async (sql: string, _params?: unknown[]) => {
    queryCallCount++;
    for (const [fragment, rows] of queryResults) {
      if (sql.includes(fragment)) {
        return { rows, rowCount: rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  }),
};

// ─── Import under test ──────────────────────────────────────────────────────

import {
  getMergedOpportunity,
  invalidateMergeCache,
  clearMergeCache,
  mergeCacheSize,
  type MergedOpportunity,
} from '../../../src/services/opportunities/merge.js';
import type pg from 'pg';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function unifiedRow(overrides: Partial<QueryRow> = {}): QueryRow {
  return {
    internal_id: 'test-uuid-001',
    lifecycle_stage: 'solicitation',
    primary_source: 'sam',
    title: null,
    agency: null,
    office: null,
    naics: null,
    psc: null,
    set_aside: null,
    estimated_value_cents: null,
    posted_at: null,
    response_due_at: null,
    award_at: null,
    pwin: 42,
    doctrine_status: 'qualified',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function link(source: string, nativeId: string, confidence?: string): QueryRow {
  return {
    id: Math.floor(Math.random() * 10000),
    internal_id: 'test-uuid-001',
    source,
    source_native_id: nativeId,
    confidence: confidence ?? 'HIGH',
    match_method: 'exact_notice_id',
    matched_at: '2026-01-01T00:00:00Z',
    confirmed_by: 'system',
    confirmed_at: null,
  };
}

function override(fieldName: string, value: unknown): QueryRow {
  return {
    id: 1,
    internal_id: 'test-uuid-001',
    field_name: fieldName,
    field_value_json: value,
    set_by: 'admin',
    set_at: '2026-01-01T00:00:00Z',
    reason: 'Manual correction',
  };
}

/**
 * Configure mock to return given source data based on source type.
 */
function setupSourceData(
  sourceType: 'sam' | 'govwin' | 'fast_track',
  data: Partial<QueryRow>,
): void {
  const base: QueryRow = {
    title: null,
    agency: null,
    office: null,
    naics: null,
    psc: null,
    set_aside: null,
    estimated_value_cents: null,
    posted_at: null,
    response_due_at: null,
    award_at: null,
    ...data,
  };

  switch (sourceType) {
    case 'sam':
      setQueryResult("data_source IN ('sam.gov', 'sam_gov')", [base]);
      break;
    case 'govwin':
      // GovWin lookups use sam_notice_id = 'govwin-...'
      // We need a way to differentiate from SAM. Use a second fragment check.
      setQueryResult("sam_notice_id = $1\n", [base]);
      break;
    case 'fast_track':
      setQueryResult('fast_track_assessments', [base]);
      break;
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetMock();
  clearMergeCache();
  mockPool.query.mockClear();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getMergedOpportunity', () => {
  describe('basic behavior', () => {
    it('returns null for non-existent internal_id', async () => {
      setQueryResult('unified_opportunities', []);
      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'missing-id');
      expect(result).toBeNull();
    });

    it('returns unified row fields when no sources are linked', async () => {
      setQueryResult('unified_opportunities', [unifiedRow()]);
      setQueryResult('unified_opportunity_links', []);
      setQueryResult('unified_opportunity_field_overrides', []);

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result).not.toBeNull();
      expect(result!.internal_id).toBe('test-uuid-001');
      expect(result!.pwin).toBe(42);
      expect(result!.doctrine_status).toBe('qualified');
      expect(result!.title).toBeNull();
    });
  });

  describe('precedence rules', () => {
    it('GovWin title wins over SAM (default precedence)', async () => {
      setQueryResult('unified_opportunities', [unifiedRow()]);
      setQueryResult('unified_opportunity_links', [
        link('sam', 'SAM-001'),
        link('govwin', 'GW-001'),
      ]);
      setQueryResult('unified_opportunity_field_overrides', []);

      // Override mockPool to handle per-source queries precisely
      let samCalled = false;
      let govwinCalled = false;

      mockPool.query.mockImplementation(async (sql: string, _params?: unknown[]) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) {
          return { rows: [unifiedRow()], rowCount: 1 };
        }
        if (sql.includes('unified_opportunity_links')) {
          return {
            rows: [link('sam', 'SAM-001'), link('govwin', 'GW-001')],
            rowCount: 2,
          };
        }
        if (sql.includes('unified_opportunity_field_overrides')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("data_source IN ('sam.gov', 'sam_gov')")) {
          samCalled = true;
          return {
            rows: [{ title: 'SAM Title', agency: 'SAM Agency', office: null, naics: '541512', psc: 'D302', set_aside: 'SDB', estimated_value_cents: 500000, posted_at: '2026-03-01', response_due_at: '2026-06-01', award_at: null }],
            rowCount: 1,
          };
        }
        if (sql.includes("sam_notice_id = $1") && !sql.includes("data_source")) {
          govwinCalled = true;
          return {
            rows: [{ title: 'GovWin Title', agency: 'GovWin Agency', office: 'GovWin Office', naics: '541511', psc: null, set_aside: '8a', estimated_value_cents: 1000000, posted_at: '2026-04-01', response_due_at: '2026-07-01', award_at: null }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');

      expect(samCalled).toBe(true);
      expect(govwinCalled).toBe(true);

      // GovWin wins for title, agency, office (highest precedence)
      expect(result!.title).toBe('GovWin Title');
      expect(result!.agency).toBe('GovWin Agency');
      expect(result!.office).toBe('GovWin Office');
      expect(result!.field_sources['title']).toBe('govwin');
      expect(result!.field_sources['agency']).toBe('govwin');
    });

    it('SAM wins for title when GovWin is absent', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) {
          return { rows: [unifiedRow()], rowCount: 1 };
        }
        if (sql.includes('unified_opportunity_links')) {
          return { rows: [link('sam', 'SAM-001')], rowCount: 1 };
        }
        if (sql.includes('unified_opportunity_field_overrides')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("data_source IN ('sam.gov', 'sam_gov')")) {
          return {
            rows: [{ title: 'SAM Title', agency: 'SAM Agency', office: null, naics: '541512', psc: 'D302', set_aside: 'SDB', estimated_value_cents: 500000, posted_at: '2026-03-01', response_due_at: '2026-06-01', award_at: null }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result!.title).toBe('SAM Title');
      expect(result!.field_sources['title']).toBe('sam');
    });
  });

  describe('estimated_value_cents — GovWin > SAM (Fast Track skipped)', () => {
    it('GovWin value wins over SAM', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) {
          return { rows: [link('sam', 'SAM-001'), link('govwin', 'GW-001')], rowCount: 2 };
        }
        if (sql.includes('unified_opportunity_field_overrides')) return { rows: [], rowCount: 0 };
        if (sql.includes("data_source IN ('sam.gov', 'sam_gov')")) {
          return { rows: [{ title: null, agency: null, office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: 500000, posted_at: null, response_due_at: null, award_at: null }], rowCount: 1 };
        }
        if (sql.includes("sam_notice_id = $1") && !sql.includes("data_source")) {
          return { rows: [{ title: null, agency: null, office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: 1000000, posted_at: null, response_due_at: null, award_at: null }], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result!.estimated_value_cents).toBe(1000000);
      expect(result!.field_sources['estimated_value_cents']).toBe('govwin');
    });

    it('SAM value wins when GovWin is null', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) {
          return { rows: [link('sam', 'SAM-001'), link('govwin', 'GW-001')], rowCount: 2 };
        }
        if (sql.includes('unified_opportunity_field_overrides')) return { rows: [], rowCount: 0 };
        if (sql.includes("data_source IN ('sam.gov', 'sam_gov')")) {
          return { rows: [{ title: null, agency: null, office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: 500000, posted_at: null, response_due_at: null, award_at: null }], rowCount: 1 };
        }
        if (sql.includes("sam_notice_id = $1") && !sql.includes("data_source")) {
          return { rows: [{ title: null, agency: null, office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: null, posted_at: null, response_due_at: null, award_at: null }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result!.estimated_value_cents).toBe(500000);
      expect(result!.field_sources['estimated_value_cents']).toBe('sam');
    });

    it('Fast Track value is skipped for estimated_value_cents', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) {
          return { rows: [link('fast_track', 'FT-001')], rowCount: 1 };
        }
        if (sql.includes('unified_opportunity_field_overrides')) return { rows: [], rowCount: 0 };
        if (sql.includes('fast_track_assessments')) {
          return { rows: [{ title: 'FT Title', agency: null, office: null, naics: '541512', psc: null, set_aside: null, estimated_value_cents: null, posted_at: null, response_due_at: null, award_at: null }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result!.estimated_value_cents).toBeNull();
    });
  });

  describe('response_due_at — SAM > GovWin', () => {
    it('SAM due date wins over GovWin', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) {
          return { rows: [link('sam', 'SAM-001'), link('govwin', 'GW-001')], rowCount: 2 };
        }
        if (sql.includes('unified_opportunity_field_overrides')) return { rows: [], rowCount: 0 };
        if (sql.includes("data_source IN ('sam.gov', 'sam_gov')")) {
          return { rows: [{ title: null, agency: null, office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: null, posted_at: null, response_due_at: '2026-06-01', award_at: null }], rowCount: 1 };
        }
        if (sql.includes("sam_notice_id = $1") && !sql.includes("data_source")) {
          return { rows: [{ title: null, agency: null, office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: null, posted_at: null, response_due_at: '2026-07-01', award_at: null }], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result!.response_due_at).toBe('2026-06-01');
      expect(result!.field_sources['response_due_at']).toBe('sam');
    });

    it('GovWin due date wins when SAM is null', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) {
          return { rows: [link('sam', 'SAM-001'), link('govwin', 'GW-001')], rowCount: 2 };
        }
        if (sql.includes('unified_opportunity_field_overrides')) return { rows: [], rowCount: 0 };
        if (sql.includes("data_source IN ('sam.gov', 'sam_gov')")) {
          return { rows: [{ title: null, agency: null, office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: null, posted_at: null, response_due_at: null, award_at: null }], rowCount: 1 };
        }
        if (sql.includes("sam_notice_id = $1") && !sql.includes("data_source")) {
          return { rows: [{ title: null, agency: null, office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: null, posted_at: null, response_due_at: '2026-07-01', award_at: null }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result!.response_due_at).toBe('2026-07-01');
      expect(result!.field_sources['response_due_at']).toBe('govwin');
    });
  });

  describe('posted_at — earliest non-null across sources', () => {
    it('picks the earliest posted_at across all sources', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) {
          return { rows: [link('sam', 'SAM-001'), link('govwin', 'GW-001')], rowCount: 2 };
        }
        if (sql.includes('unified_opportunity_field_overrides')) return { rows: [], rowCount: 0 };
        if (sql.includes("data_source IN ('sam.gov', 'sam_gov')")) {
          return { rows: [{ title: null, agency: null, office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: null, posted_at: '2026-03-15', response_due_at: null, award_at: null }], rowCount: 1 };
        }
        if (sql.includes("sam_notice_id = $1") && !sql.includes("data_source")) {
          return { rows: [{ title: null, agency: null, office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: null, posted_at: '2026-04-01', response_due_at: null, award_at: null }], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result!.posted_at).toBe('2026-03-15');
      expect(result!.field_sources['posted_at']).toBe('sam');
    });
  });

  describe('override beats every source', () => {
    it('override agency wins over GovWin and SAM', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) {
          return { rows: [link('sam', 'SAM-001'), link('govwin', 'GW-001')], rowCount: 2 };
        }
        if (sql.includes('unified_opportunity_field_overrides')) {
          return { rows: [override('agency', 'Override Agency')], rowCount: 1 };
        }
        if (sql.includes("data_source IN ('sam.gov', 'sam_gov')")) {
          return { rows: [{ title: 'SAM Title', agency: 'SAM Agency', office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: null, posted_at: null, response_due_at: null, award_at: null }], rowCount: 1 };
        }
        if (sql.includes("sam_notice_id = $1") && !sql.includes("data_source")) {
          return { rows: [{ title: 'GovWin Title', agency: 'GovWin Agency', office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: null, posted_at: null, response_due_at: null, award_at: null }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result!.agency).toBe('Override Agency');
      expect(result!.field_sources['agency']).toBe('override');
      // Title still comes from GovWin (no override for title)
      expect(result!.title).toBe('GovWin Title');
      expect(result!.field_sources['title']).toBe('govwin');
    });

    it('override estimated_value_cents beats all sources', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) {
          return { rows: [link('govwin', 'GW-001')], rowCount: 1 };
        }
        if (sql.includes('unified_opportunity_field_overrides')) {
          return { rows: [override('estimated_value_cents', 9999999)], rowCount: 1 };
        }
        if (sql.includes("sam_notice_id = $1") && !sql.includes("data_source")) {
          return { rows: [{ title: null, agency: null, office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: 1000000, posted_at: null, response_due_at: null, award_at: null }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result!.estimated_value_cents).toBe(9999999);
      expect(result!.field_sources['estimated_value_cents']).toBe('override');
    });

    it('override response_due_at beats all sources', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) {
          return { rows: [link('sam', 'SAM-001')], rowCount: 1 };
        }
        if (sql.includes('unified_opportunity_field_overrides')) {
          return { rows: [override('response_due_at', '2026-12-31')], rowCount: 1 };
        }
        if (sql.includes("data_source IN ('sam.gov', 'sam_gov')")) {
          return { rows: [{ title: null, agency: null, office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: null, posted_at: null, response_due_at: '2026-06-01', award_at: null }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result!.response_due_at).toBe('2026-12-31');
      expect(result!.field_sources['response_due_at']).toBe('override');
    });
  });

  describe('null-handling', () => {
    it('returns null for field when no source has it', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) {
          return { rows: [link('sam', 'SAM-001')], rowCount: 1 };
        }
        if (sql.includes('unified_opportunity_field_overrides')) return { rows: [], rowCount: 0 };
        if (sql.includes("data_source IN ('sam.gov', 'sam_gov')")) {
          return { rows: [{ title: null, agency: null, office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: null, posted_at: null, response_due_at: null, award_at: null }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result!.title).toBeNull();
      expect(result!.agency).toBeNull();
      expect(result!.office).toBeNull();
      expect(result!.naics).toBeNull();
      expect(result!.psc).toBeNull();
      expect(result!.set_aside).toBeNull();
      expect(result!.estimated_value_cents).toBeNull();
      expect(result!.posted_at).toBeNull();
      expect(result!.response_due_at).toBeNull();
      expect(result!.award_at).toBeNull();
    });

    it('skips lower precedence null, picks higher precedence non-null', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) {
          return { rows: [link('sam', 'SAM-001'), link('govwin', 'GW-001')], rowCount: 2 };
        }
        if (sql.includes('unified_opportunity_field_overrides')) return { rows: [], rowCount: 0 };
        if (sql.includes("data_source IN ('sam.gov', 'sam_gov')")) {
          return { rows: [{ title: 'SAM Title', agency: null, office: null, naics: null, psc: null, set_aside: null, estimated_value_cents: null, posted_at: null, response_due_at: null, award_at: null }], rowCount: 1 };
        }
        if (sql.includes("sam_notice_id = $1") && !sql.includes("data_source")) {
          return { rows: [{ title: null, agency: 'GovWin Agency', office: null, naics: '541511', psc: null, set_aside: null, estimated_value_cents: null, posted_at: null, response_due_at: null, award_at: null }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      // GovWin has higher precedence than SAM, but title is null in GovWin
      expect(result!.title).toBe('SAM Title');
      expect(result!.field_sources['title']).toBe('sam');
      // Agency from GovWin (higher precedence)
      expect(result!.agency).toBe('GovWin Agency');
      expect(result!.field_sources['agency']).toBe('govwin');
    });

    it('REJECTED links are excluded', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) {
          return { rows: [link('govwin', 'GW-001', 'REJECTED')], rowCount: 1 };
        }
        if (sql.includes('unified_opportunity_field_overrides')) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      // No source data fetched for rejected links
      expect(result!.title).toBeNull();
    });
  });

  describe('pwin and doctrine_status — always from unified row', () => {
    it('pwin comes from unified row, never from sources', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) {
          return { rows: [unifiedRow({ pwin: 75 })], rowCount: 1 };
        }
        if (sql.includes('unified_opportunity_links')) return { rows: [], rowCount: 0 };
        if (sql.includes('unified_opportunity_field_overrides')) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result!.pwin).toBe(75);
    });

    it('doctrine_status comes from unified row, never from sources', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) {
          return { rows: [unifiedRow({ doctrine_status: 'excluded' })], rowCount: 1 };
        }
        if (sql.includes('unified_opportunity_links')) return { rows: [], rowCount: 0 };
        if (sql.includes('unified_opportunity_field_overrides')) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result!.doctrine_status).toBe('excluded');
    });

    it('pwin null on unified row stays null even if overrides exist for other fields', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        queryCallCount++;
        if (sql.includes('unified_opportunities WHERE')) {
          return { rows: [unifiedRow({ pwin: null })], rowCount: 1 };
        }
        if (sql.includes('unified_opportunity_links')) return { rows: [], rowCount: 0 };
        if (sql.includes('unified_opportunity_field_overrides')) {
          return { rows: [override('title', 'Override Title')], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(result!.pwin).toBeNull();
    });
  });

  describe('cache behavior', () => {
    it('second call within TTL returns cached result (no extra DB queries)', async () => {
      let dbCallCount = 0;

      mockPool.query.mockImplementation(async (sql: string) => {
        dbCallCount++;
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) return { rows: [], rowCount: 0 };
        if (sql.includes('unified_opportunity_field_overrides')) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      });

      const result1 = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      const callsAfterFirst = dbCallCount;

      const result2 = await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      const callsAfterSecond = dbCallCount;

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result1!.internal_id).toBe(result2!.internal_id);
      // No additional DB calls on cache hit
      expect(callsAfterSecond).toBe(callsAfterFirst);
      expect(mergeCacheSize()).toBe(1);
    });

    it('invalidateMergeCache causes next call to re-fetch', async () => {
      let dbCallCount = 0;

      mockPool.query.mockImplementation(async (sql: string) => {
        dbCallCount++;
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) return { rows: [], rowCount: 0 };
        if (sql.includes('unified_opportunity_field_overrides')) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      });

      await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      const callsAfterFirst = dbCallCount;

      invalidateMergeCache('test-uuid-001');
      expect(mergeCacheSize()).toBe(0);

      await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      // DB was called again after invalidation
      expect(dbCallCount).toBeGreaterThan(callsAfterFirst);
    });

    it('clearMergeCache empties the entire cache', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('unified_opportunities WHERE')) return { rows: [unifiedRow()], rowCount: 1 };
        if (sql.includes('unified_opportunity_links')) return { rows: [], rowCount: 0 };
        if (sql.includes('unified_opportunity_field_overrides')) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      });

      await getMergedOpportunity(mockPool as unknown as pg.Pool, 'test-uuid-001');
      expect(mergeCacheSize()).toBe(1);

      clearMergeCache();
      expect(mergeCacheSize()).toBe(0);
    });
  });
});
