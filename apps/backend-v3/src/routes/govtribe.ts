/**
 * GovTribe API routes — health, credits, sync, opp proxy.
 *
 * GET  /v3/govtribe/health  — API reachability + credit status
 * GET  /v3/govtribe/credits — Credit usage dashboard data
 * POST /v3/govtribe/sync    — Manual ingest trigger (admin only)
 * GET  /v3/govtribe/opp/:govtribe_id — Live detail proxy with caching
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import {
  getCreditBudgetStatus,
  govtribeFetch,
} from '../ingest/govtribe/client.js';
import { runIngest } from '../ingest/framework/registry.js';
import type { JwtPayload } from '../middleware/auth.js';
import type { GovTribeOpportunityRaw } from '../ingest/govtribe/types.js';

function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  const user = (req as FastifyRequest & { user?: JwtPayload }).user;
  if (!user || user.role !== 'admin') {
    void reply.status(403).send(
      errorEnvelope('UNAUTHORIZED', 'Admin role required', req.requestId),
    );
    return false;
  }
  return true;
}

export async function govtribeRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v3/govtribe/health
   * Returns API reachability (inferred from last ingest run), last poll,
   * credit pct — no live API call, no credits burned.
   */
  app.get('/v3/govtribe/health', async (req, reply) => {
    const budgetStatus = await getCreditBudgetStatus();

    const { rows: lastPollRows } = await pool.query(
      `SELECT finished_at::text AS last_poll_at, status, error_text AS last_error
       FROM ingest_runs
       WHERE source_key = 'govtribe'
       ORDER BY started_at DESC LIMIT 1`,
    );

    const lastPoll = lastPollRows[0] ?? null;
    const apiReachable = lastPoll ? lastPoll.status === 'success' || lastPoll.status === 'degraded' : false;
    const lastError = lastPoll?.last_error ?? null;

    return reply.send(
      successEnvelope(
        {
          api_reachable: apiReachable,
          last_poll_at: lastPoll?.last_poll_at ?? null,
          last_error: lastError,
          credits: {
            used: budgetStatus.credits_used,
            budget: budgetStatus.credits_budget,
            pct: budgetStatus.pct,
          },
        },
        req.requestId,
      ),
    );
  });

  /**
   * GET /v3/govtribe/credits
   * Detailed credit usage for Sentinel UI — uses local aggregates, no API call.
   */
  app.get('/v3/govtribe/credits', async (req, reply) => {
    const { rows: monthlyRows } = await pool.query(
      `SELECT month, credits_used, credits_budget, last_call_at::text
       FROM govtribe_credit_monthly
       ORDER BY month DESC LIMIT 3`,
    );

    const { rows: topEndpoints } = await pool.query(
      `SELECT endpoint, SUM(cost_credits) AS total_credits, COUNT(*) AS call_count
       FROM govtribe_credit_ledger
       WHERE decision = 'called'
         AND created_at >= date_trunc('month', NOW())
       GROUP BY endpoint
       ORDER BY total_credits DESC`,
    );

    const thisMonth = monthlyRows[0] ?? { month: null, credits_used: 0, credits_budget: 5000, last_call_at: null };

    return reply.send(
      successEnvelope(
        {
          this_month: thisMonth,
          last_3_months: monthlyRows,
          top_endpoints: topEndpoints,
        },
        req.requestId,
      ),
    );
  });

  /**
   * POST /v3/govtribe/sync?endpoint=opportunities&dry_run=true
   * Manual trigger (admin only). Credit-budget enforced.
   * dry_run=true returns row count without writing or burning credits.
   */
  app.post('/v3/govtribe/sync', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const query = req.query as { endpoint?: string; dry_run?: string };
    const endpoint = query.endpoint ?? 'opportunities';
    const dryRun = query.dry_run === 'true';

    const validEndpoints = ['opportunities', 'contacts', 'vehicles', 'budget'];
    if (!validEndpoints.includes(endpoint)) {
      return reply.status(400).send(
        errorEnvelope(
          'VALIDATION_ERROR',
          `Invalid endpoint. Must be one of: ${validEndpoints.join(', ')}`,
          req.requestId,
        ),
      );
    }

    if (dryRun) {
      const budgetStatus = await getCreditBudgetStatus();

      const { rows } = await pool.query(
        `SELECT COUNT(*) AS count FROM opportunities
         WHERE data_source = 'govtribe' AND deleted_at IS NULL`,
      );

      return reply.send(
        successEnvelope(
          {
            dry_run: true,
            endpoint,
            existing_govtribe_opps: parseInt(rows[0]?.count ?? '0', 10),
            credits: budgetStatus,
          },
          req.requestId,
        ),
      );
    }

    const sourceKeyMap: Record<string, string> = {
      opportunities: 'govtribe',
      contacts: 'govtribe.contacts',
      vehicles: 'govtribe.vehicles',
      budget: 'govtribe.budget',
    };

    try {
      const user = (req as FastifyRequest & { user?: JwtPayload }).user;
      logger.info({ source: 'govtribe', endpoint, triggeredBy: user?.sub }, 'govtribe_sync_trigger');

      const sourceKey = sourceKeyMap[endpoint];
      if (!sourceKey) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', `Unknown endpoint: ${endpoint}`, req.requestId),
        );
      }

      const { runId, result, durationMs } = await runIngest(sourceKey);

      return reply.send(
        successEnvelope(
          {
            run_id: String(runId),
            endpoint,
            rows_inserted: result.inserted,
            rows_updated: result.updated,
            rows_skipped: result.skipped,
            status: result.degraded ? 'degraded' : 'success',
            duration_ms: durationMs,
            ...(result.degradedReason ? { degraded_reason: result.degradedReason } : {}),
          },
          req.requestId,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ source: 'govtribe', endpoint, error: message }, 'govtribe_sync_error');

      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', message, req.requestId),
      );
    }
  });

  /**
   * GET /v3/govtribe/opp/:govtribe_id
   * Proxy to live GovTribe detail with caching. Credit-budget enforced.
   * Used by Opp-Auto-Analysis for incumbent/agency/contact intel.
   */
  app.get<{ Params: { govtribe_id: string } }>(
    '/v3/govtribe/opp/:govtribe_id',
    async (req, reply) => {
      const { govtribe_id } = req.params;

      const result = await govtribeFetch<GovTribeOpportunityRaw>(
        'opportunities_detail',
        `/opportunities/${encodeURIComponent(govtribe_id)}`,
        govtribe_id,
        true,
      );

      return reply.send(
        successEnvelope(
          {
            govtribe_id,
            data: result.data,
            from_cache: result.from_cache,
            decision: result.decision,
            credits_used: result.credits_used,
            budget: result.budget_status,
          },
          req.requestId,
        ),
      );
    },
  );
}
