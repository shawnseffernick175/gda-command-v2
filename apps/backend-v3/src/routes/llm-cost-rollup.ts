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

const VALID_WINDOWS = ['1d', '7d', '30d'] as const;
type WindowParam = (typeof VALID_WINDOWS)[number];

function windowToInterval(w: WindowParam): string {
  switch (w) {
    case '1d': return '1 day';
    case '7d': return '7 days';
    case '30d': return '30 days';
  }
}

const ROLLUP_SQL = `
  SELECT
    task,
    COUNT(*)::int AS call_count,
    COALESCE(SUM(latency_ms), 0)::int AS total_latency_ms,
    COALESCE(SUM(tokens_input), 0)::int AS total_tokens_input,
    COALESCE(SUM(tokens_output), 0)::int AS total_tokens_output,
    COALESCE(SUM(cost_estimate_usd), 0)::numeric(10,6) AS total_cost_usd
  FROM llm_calls
  WHERE created_at >= NOW() - $1::interval
  GROUP BY task
  ORDER BY total_cost_usd DESC
`;

export async function llmCostRollupRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/llm-cost-rollup', async (req, reply) => {
    const { window } = req.query as { window?: string };

    if (!window || !VALID_WINDOWS.includes(window as WindowParam)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'window must be one of: 1d, 7d, 30d', req.requestId)
      );
    }

    const interval = windowToInterval(window as WindowParam);

    try {
      const result = await pool.query(ROLLUP_SQL, [interval]);
      const entries: CostRollupEntry[] = result.rows.map((row: Record<string, unknown>) => ({
        task: row['task'] as Task,
        call_count: Number(row['call_count']),
        total_latency_ms: Number(row['total_latency_ms']),
        total_tokens_input: Number(row['total_tokens_input']),
        total_tokens_output: Number(row['total_tokens_output']),
        total_cost_usd: Number(row['total_cost_usd']),
      }));

      const totals = entries.reduce(
        (acc, e) => ({
          call_count: acc.call_count + e.call_count,
          total_cost_usd: acc.total_cost_usd + e.total_cost_usd,
        }),
        { call_count: 0, total_cost_usd: 0 },
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
