/**
 * Unit tests for the F-441 conversion funnel report service.
 *
 * Covers:
 *   - Stage mapping: all 7 canonical stages present even when only discovery has rows
 *   - Conversions: zero from-count yields rate 0 (no NaN / divide-by-zero)
 *   - Grade distribution includes ungraded bucket for NULLs
 *   - Signal funnel: parseable scores bucket via recommendStatus; scored===0 path
 *   - Decisions: empty audit_log → by_action [], counts 0, avg null
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type pg from 'pg';
import {
  buildFunnelReport,
  CANONICAL_STAGES,
  type FunnelReport,
} from '../../../src/services/reports/funnel.js';

// ─── Query-shape mock pool ──────────────────────────────────────────────────

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number };
type QueryHandler = (sql: string, params?: unknown[]) => QueryResult;

let queryHandler: QueryHandler;

const mockPool = {
  query: vi.fn(async (sql: string, params?: unknown[]) => queryHandler(sql, params)),
};

function defaultHandler(sql: string): QueryResult {
  // status counts
  if (/FROM opportunities.*GROUP BY status/i.test(sql)) {
    return { rows: [{ status: 'discovery', cnt: '3711' }], rowCount: 1 };
  }
  // qualified count
  if (/qualified_at IS NOT NULL/i.test(sql)) {
    return { rows: [{ cnt: '0' }], rowCount: 1 };
  }
  // grade distribution
  if (/GROUP BY grade/i.test(sql)) {
    return { rows: [{ grade: null, cnt: '3711' }], rowCount: 1 };
  }
  // pwin scores
  if (/pwin/i.test(sql)) {
    return { rows: [], rowCount: 0 };
  }
  // audit_log by_action
  if (/FROM audit_log/i.test(sql)) {
    return { rows: [], rowCount: 0 };
  }
  // open review queue (MEDIUM/LOW)
  if (/unified_opportunity_links.*'MEDIUM'/i.test(sql)) {
    return { rows: [{ cnt: '0' }], rowCount: 1 };
  }
  // decided total (CONFIRMED/REJECTED)
  if (/unified_opportunity_links.*'CONFIRMED'/i.test(sql) && !/AVG/i.test(sql)) {
    return { rows: [{ cnt: '0' }], rowCount: 1 };
  }
  // avg decision age
  if (/AVG.*confirmed_at/i.test(sql)) {
    return { rows: [{ avg_hours: null }], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
}

beforeEach(() => {
  mockPool.query.mockClear();
  queryHandler = defaultHandler;
});

// ─── Stage mapping ──────────────────────────────────────────────────────────

describe('lifecycle stage mapping', () => {
  it('lists all 7 canonical stages in order even when only discovery has rows', async () => {
    const report = await buildFunnelReport(mockPool as unknown as pg.Pool);

    expect(report.lifecycle.stages).toHaveLength(7);
    expect(report.lifecycle.stages.map((s) => s.stage)).toEqual([...CANONICAL_STAGES]);
    expect(report.lifecycle.stages[0]!.count).toBe(3711);
    for (let i = 1; i < 7; i++) {
      expect(report.lifecycle.stages[i]!.count).toBe(0);
    }
    expect(report.lifecycle.total).toBe(3711);
  });

  it('sums total from all present stages', async () => {
    queryHandler = (sql, params) => {
      if (/FROM opportunities.*GROUP BY status/i.test(sql)) {
        return {
          rows: [
            { status: 'discovery', cnt: '100' },
            { status: 'tracking', cnt: '50' },
            { status: 'awarded', cnt: '5' },
          ],
          rowCount: 3,
        };
      }
      return defaultHandler(sql, params);
    };

    const report = await buildFunnelReport(mockPool as unknown as pg.Pool);
    expect(report.lifecycle.total).toBe(155);
    expect(report.lifecycle.stages.find((s) => s.stage === 'qualifying')!.count).toBe(0);
  });
});

// ─── Conversions ────────────────────────────────────────────────────────────

describe('conversions', () => {
  it('produces rate 0 when from-count is 0 (no divide-by-zero)', async () => {
    const report = await buildFunnelReport(mockPool as unknown as pg.Pool);

    expect(report.lifecycle.conversions).toHaveLength(6);
    // discovery→tracking: 3711→0 = 0
    expect(report.lifecycle.conversions[0]).toEqual({
      from: 'discovery',
      to: 'tracking',
      rate: 0,
    });
    // tracking→qualifying: 0→0 = 0 (from-count 0 guard)
    expect(report.lifecycle.conversions[1]!.rate).toBe(0);
    // verify no NaN anywhere
    for (const c of report.lifecycle.conversions) {
      expect(Number.isFinite(c.rate)).toBe(true);
    }
  });

  it('computes non-zero ratios correctly', async () => {
    queryHandler = (sql, params) => {
      if (/FROM opportunities.*GROUP BY status/i.test(sql)) {
        return {
          rows: [
            { status: 'discovery', cnt: '100' },
            { status: 'tracking', cnt: '50' },
          ],
          rowCount: 2,
        };
      }
      return defaultHandler(sql, params);
    };

    const report = await buildFunnelReport(mockPool as unknown as pg.Pool);
    expect(report.lifecycle.conversions[0]!.rate).toBeCloseTo(0.5);
  });
});

// ─── Grade distribution ─────────────────────────────────────────────────────

describe('grade_distribution', () => {
  it('includes ungraded bucket for NULLs', async () => {
    const report = await buildFunnelReport(mockPool as unknown as pg.Pool);

    const dist = report.lifecycle.grade_distribution;
    expect(dist).toEqual([
      { grade: 'A', count: 0 },
      { grade: 'B', count: 0 },
      { grade: 'C', count: 0 },
      { grade: 'ungraded', count: 3711 },
    ]);
  });

  it('maps A/B/C grades alongside ungraded', async () => {
    queryHandler = (sql, params) => {
      if (/GROUP BY grade/i.test(sql)) {
        return {
          rows: [
            { grade: 'A', cnt: '10' },
            { grade: 'B', cnt: '5' },
            { grade: null, cnt: '85' },
          ],
          rowCount: 3,
        };
      }
      return defaultHandler(sql, params);
    };

    const report = await buildFunnelReport(mockPool as unknown as pg.Pool);
    expect(report.lifecycle.grade_distribution).toEqual([
      { grade: 'A', count: 10 },
      { grade: 'B', count: 5 },
      { grade: 'C', count: 0 },
      { grade: 'ungraded', count: 85 },
    ]);
  });
});

// ─── Signal funnel ──────────────────────────────────────────────────────────

describe('signal_funnel', () => {
  it('returns all bands at 0 with note when scored === 0', async () => {
    const report = await buildFunnelReport(mockPool as unknown as pg.Pool);

    expect(report.signal_funnel.scored).toBe(0);
    expect(report.signal_funnel.note).toBe('no scored opportunities yet');
    for (const b of report.signal_funnel.bands) {
      expect(b.count).toBe(0);
    }
  });

  it('buckets parseable scores via recommendStatus thresholds', async () => {
    queryHandler = (sql, params) => {
      if (/pwin/i.test(sql)) {
        return {
          rows: [
            { score_text: '30' },   // discovery (<45)
            { score_text: '50' },   // signal (45-66)
            { score_text: '80' },   // forecast (>=67)
            { score_text: '45' },   // signal (boundary)
            { score_text: '67' },   // forecast (boundary)
            { score_text: null },   // skipped
            { score_text: 'bad' },  // skipped (non-numeric)
          ],
          rowCount: 7,
        };
      }
      return defaultHandler(sql, params);
    };

    const report = await buildFunnelReport(mockPool as unknown as pg.Pool);
    expect(report.signal_funnel.scored).toBe(5);
    expect(report.signal_funnel.bands).toEqual([
      { band: 'discovery', count: 1 },
      { band: 'signal', count: 2 },
      { band: 'forecast', count: 2 },
    ]);
    expect(report.signal_funnel.note).toBeUndefined();
  });
});

// ─── Decision activity ──────────────────────────────────────────────────────

describe('decisions', () => {
  it('returns empty by_action, counts 0, and null avg when no data', async () => {
    const report = await buildFunnelReport(mockPool as unknown as pg.Pool);

    expect(report.decisions.by_action).toEqual([]);
    expect(report.decisions.open_review_queue).toBe(0);
    expect(report.decisions.decided_total).toBe(0);
    expect(report.decisions.avg_decision_age_hours).toBeNull();
    expect(report.decisions.window_days).toBe(30);
  });

  it('respects custom window_days', async () => {
    const report = await buildFunnelReport(mockPool as unknown as pg.Pool, { window_days: 7 });
    expect(report.decisions.window_days).toBe(7);
  });

  it('clamps window_days to [1, 365]', async () => {
    const lo = await buildFunnelReport(mockPool as unknown as pg.Pool, { window_days: 0 });
    expect(lo.decisions.window_days).toBe(1);

    const hi = await buildFunnelReport(mockPool as unknown as pg.Pool, { window_days: 999 });
    expect(hi.decisions.window_days).toBe(365);
  });
});
