/**
 * GET /v3/llm-cost-rollup — LLM cost rollup by task.
 *
 * Per D4 §11. Returns CostRollupResponse shape aggregated
 * from llm_calls table.
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import type { CostRollupResponse, CostRollupEntry, Task } from '../lib/llm-router.types.js';

const VALID_WINDOWS = ['live', '1d', '7d', '30d'] as const;
type WindowParam = (typeof VALID_WINDOWS)[number];

function buildRollupSQL(window: WindowParam): { sql: string; params: unknown[] } {
  const whereClause = window === 'live'
    ? `WHERE created_at >= date_trunc('day', NOW())`
    : `WHERE created_at >= NOW() - $1::interval`;

  const sql = `
    SELECT
      task,
      provider,
      model,
      COUNT(*)::int                                                   AS call_count,
      COUNT(*) FILTER (WHERE error_kind IS NOT NULL)::int             AS error_count,
      COALESCE(SUM(latency_ms), 0)::int                               AS total_latency_ms,
      COALESCE(AVG(latency_ms), 0)::int                               AS avg_latency_ms,
      COALESCE(SUM(tokens_input), 0)::bigint                          AS total_tokens_input,
      COALESCE(SUM(tokens_output), 0)::bigint                         AS total_tokens_output,
      COALESCE(SUM(cost_estimate_usd), 0)::numeric(12,6)              AS total_cost_usd
    FROM llm_calls
    ${whereClause}
    GROUP BY task, provider, model
    ORDER BY task ASC, call_count DESC
  `;

  const intervalMap: Record<string, string> = {
    '1d': '1 day',
    '7d': '7 days',
    '30d': '30 days',
  };
  const params = window === 'live' ? [] : [intervalMap[window]];

  return { sql, params };
}

export async function llmCostRollupRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/llm-cost-rollup', async (req, reply) => {
    const { window } = req.query as { window?: string };

    if (!window || !VALID_WINDOWS.includes(window as WindowParam)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'window must be one of: live, 1d, 7d, 30d', req.requestId)
      );
    }

    const { sql, params } = buildRollupSQL(window as WindowParam);

    try {
      const result = await pool.query(sql, params);
      const entries: CostRollupEntry[] = result.rows.map((row: Record<string, unknown>) => ({
        task: row['task'] as Task,
        provider: (row['provider'] as string) ?? 'unknown',
        model: (row['model'] as string) ?? 'unknown',
        call_count: Number(row['call_count']),
        error_count: Number(row['error_count']),
        total_latency_ms: Number(row['total_latency_ms']),
        avg_latency_ms: Number(row['avg_latency_ms']),
        total_tokens_input: Number(row['total_tokens_input']),
        total_tokens_output: Number(row['total_tokens_output']),
        total_cost_usd: Number(row['total_cost_usd']),
      }));

      const totals = entries.reduce(
        (acc, e) => ({
          call_count: acc.call_count + e.call_count,
          error_count: acc.error_count + e.error_count,
          total_cost_usd: acc.total_cost_usd + e.total_cost_usd,
        }),
        { call_count: 0, error_count: 0, total_cost_usd: 0 },
      );

      const response: CostRollupResponse = {
        window,
        entries,
        totals,
        generated_at: new Date().toISOString(),
      };

      return reply.send(successEnvelope(response, req.requestId));
    } catch (err) {
      const e = err as Error;
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', e.message ?? 'Failed to query llm_calls', req.requestId)
      );
    }
  });
}
