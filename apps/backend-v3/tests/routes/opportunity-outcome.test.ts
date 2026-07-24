/**
 * Route test for POST /v3/opportunities/:id/outcome (report item 5).
 *
 * Guards the win-status reconciliation: recording an outcome must not only
 * write pwin_outcomes but also advance the pipeline stage so the Opportunities
 * list (which derives status from pipeline_items) reflects it. Previously the
 * outcome path wrote only pwin_outcomes, so a "won" opportunity still showed as
 * active — the TradeWinds discrepancy.
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

process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret-test-secret-test-secret-1234';
process.env['DATABASE_URL'] = 'postgres://test:test@localhost:5432/test';
process.env['ANALYSIS_VERSION'] = 'v-test';
process.env['ANALYSIS_TIMEOUT_MS'] = '500';
process.env['ANALYSIS_POLL_INTERVAL_MS'] = '10';

import Fastify, { type FastifyInstance } from 'fastify';
import { requestIdHook } from '../../src/middleware/requestId.js';

const OPP_ID = '123';

function oppRow() {
  return {
    id: OPP_ID,
    title: 'TradeWinds',
    analysis: { pwin: { score: 72 } },
    source_id: 9,
    deleted_at: null,
    updated_at: '2026-01-02T00:00:00Z',
  };
}

/**
 * Scripted pool that starts with an active pipeline stage and records the
 * stage written by the reconciliation so getPipelineStage reflects it.
 */
function installScriptedPool(): { capturedStage: () => string | null } {
  let pipelineStage = 'solicitation';
  let captured: string | null = null;
  queryImpl.fn = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('INSERT INTO pwin_outcomes')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('UPDATE opportunities SET')) {
      return { rows: [oppRow()], rowCount: 1 };
    }
    if (sql.includes('SELECT id, stage FROM pipeline_items')) {
      return { rows: [{ id: 5, stage: pipelineStage }], rowCount: 1 };
    }
    if (sql.includes('UPDATE pipeline_items SET stage')) {
      captured = (params?.[0] as string) ?? null;
      pipelineStage = captured ?? pipelineStage;
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT stage FROM pipeline_items')) {
      return { rows: [{ stage: pipelineStage }], rowCount: 1 };
    }
    if (sql.includes('SELECT * FROM opportunities WHERE id = $1')) {
      return { rows: [oppRow()], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }) as unknown as QueryFn;
  return { capturedStage: () => captured };
}

describe('POST /v3/opportunities/:id/outcome — pipeline reconciliation (item 5)', () => {
  let app: FastifyInstance;
  let pool: { capturedStage: () => string | null };

  beforeEach(async () => {
    pool = installScriptedPool();
    const { opportunityRoutes } = await import('../../src/routes/opportunities.js');
    app = Fastify();
    app.addHook('onRequest', requestIdHook);
    await app.register(opportunityRoutes);
    await app.ready();
  });

  it('advances the pipeline stage to won when a win is recorded', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${OPP_ID}/outcome`,
      payload: { outcome: 'won' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      success: boolean;
      data: { actual_outcome: string; pipeline_stage: string | null };
    };
    expect(body.success).toBe(true);
    expect(body.data.actual_outcome).toBe('won');
    // The fix: the outcome now reconciles pipeline_items to the terminal stage.
    expect(pool.capturedStage()).toBe('won');
    expect(body.data.pipeline_stage).toBe('won');
    await app.close();
  });

  it('rejects an invalid outcome without touching the pipeline', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v3/opportunities/${OPP_ID}/outcome`,
      payload: { outcome: 'maybe' },
    });

    expect(res.statusCode).toBe(400);
    expect(pool.capturedStage()).toBeNull();
    await app.close();
  });
});
