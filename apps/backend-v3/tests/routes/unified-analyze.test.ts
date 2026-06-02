/**
 * Route regression test for the F-420a unified analyze endpoint.
 *
 * Guards the Devin #639/0001 fix: after analysis completes, the endpoint must
 * invalidate the 60s merge cache before re-reading, otherwise it returns the
 * stale pre-analysis unified detail. We script the mocked pool so the unified
 * row's pwin changes from 50 (pre-analysis) to 90 (post-analysis) and assert
 * the endpoint returns 90 — which is only possible if the cache was busted.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock the pool BEFORE importing the route module ─────────────────────────

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;

const queryImpl = { fn: vi.fn() as unknown as QueryFn };

vi.mock('../../src/lib/db.js', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => queryImpl.fn(sql, params),
  },
}));

// Required config env for ../config/index.js (analysis timing + version).
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret-test-secret-test-secret-1234';
process.env['DATABASE_URL'] = 'postgres://test:test@localhost:5432/test';
process.env['ANALYSIS_VERSION'] = 'v-test';
process.env['ANALYSIS_TIMEOUT_MS'] = '500';
process.env['ANALYSIS_POLL_INTERVAL_MS'] = '10';

import Fastify, { type FastifyInstance } from 'fastify';
import { clearMergeCache } from '../../src/services/opportunities/merge.js';
import { requestIdHook } from '../../src/middleware/requestId.js';

// ─── Row builders ────────────────────────────────────────────────────────────

const INTERNAL_ID = 'uo-analyze-1';
const OPP_ID = 'opp-analyze-1';

function unifiedRow(pwin: number) {
  return {
    internal_id: INTERNAL_ID,
    lifecycle_stage: 'solicitation',
    primary_source: 'sam',
    pwin,
    doctrine_status: 'qualified',
    title: 'Analyze Test Opp',
    agency: 'Navy',
    naics: '541512',
    psc: 'D307',
    set_aside: 'SDVOSB',
    estimated_value_cents: 1000000,
    posted_at: '2026-01-01T00:00:00Z',
    response_due_at: '2026-02-01T00:00:00Z',
    award_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };
}

function linkRow() {
  return {
    id: 1,
    internal_id: INTERNAL_ID,
    source: 'sam',
    source_native_id: 'N-1',
    confidence: 'HIGH',
    match_method: 'exact_notice_id',
    matched_at: '2026-01-01T12:00:00Z',
    confirmed_by: null,
    confirmed_at: null,
  };
}

function samSourceRow() {
  return {
    title: 'Analyze Test Opp',
    agency: 'Navy',
    office: null,
    naics: '541512',
    psc: 'D307',
    set_aside: 'SDVOSB',
    estimated_value_cents: 1000000,
    posted_at: '2026-01-01T00:00:00Z',
    response_due_at: '2026-02-01T00:00:00Z',
    award_at: null,
  };
}

// A "fresh" analysis row so waitForAnalysis returns immediately (not 503).
function freshAnalysisRow() {
  return {
    id: OPP_ID,
    analysis: { pwin: 90 },
    analysis_version: 'v-test',
    ai_analyzed_at: '2026-01-03T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };
}

/**
 * Scripted pool: serves the merge reads, the resolver id-lookup, and the
 * analysis poll. `mergeReadCount` lets the unified row flip pwin 50 -> 90
 * across the two getUnifiedOpportunityDetail calls.
 */
function installScriptedPool() {
  let mergeReadCount = 0;
  queryImpl.fn = vi.fn(async (sql: string) => {
    if (sql.includes('FROM unified_opportunities WHERE internal_id')) {
      // First merged read -> pwin 50 (cached); after invalidation -> pwin 90.
      const pwin = mergeReadCount === 0 ? 50 : 90;
      mergeReadCount += 1;
      return { rows: [unifiedRow(pwin)], rowCount: 1 };
    }
    if (sql.includes('FROM unified_opportunity_links WHERE internal_id')) {
      return { rows: [linkRow()], rowCount: 1 };
    }
    if (sql.includes('FROM unified_opportunity_field_overrides WHERE internal_id')) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("data_source = 'sam_gov'") && sql.includes('SELECT id FROM opportunities')) {
      // resolvePrimaryOpportunityId id-lookup
      return { rows: [{ id: OPP_ID }], rowCount: 1 };
    }
    if (sql.includes("data_source = 'sam_gov'")) {
      // fetchSourceRecords (sam) field read
      return { rows: [samSourceRow()], rowCount: 1 };
    }
    if (sql.includes('SELECT * FROM opportunities WHERE id = $1')) {
      // waitForAnalysis poll -> fresh
      return { rows: [freshAnalysisRow()], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }) as unknown as QueryFn;
}

// ─── Test ────────────────────────────────────────────────────────────────────

describe('POST /v3/opportunities/unified/:internal_id/analyze (F-420a R2)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    clearMergeCache();
    installScriptedPool();
    const { opportunityRoutes } = await import('../../src/routes/opportunities.js');
    app = Fastify();
    app.addHook('onRequest', requestIdHook);
    await app.register(opportunityRoutes);
    await app.ready();
  });

  it('invalidates the merge cache so the response reflects post-analysis pwin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/unified/${INTERNAL_ID}/analyze`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { success: boolean; data: { pwin: number } };
    expect(body.success).toBe(true);
    // The fix: without invalidateMergeCache, this would be the cached 50.
    expect(body.data.pwin).toBe(90);
    await app.close();
  });
});
