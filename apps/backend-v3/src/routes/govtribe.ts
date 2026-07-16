/**
 * GovTribe API routes — health, credits, sync, tool discovery, opp proxy.
 *
 * GET  /v3/govtribe/health  — MCP reachability + credit status
 * GET  /v3/govtribe/credits — Credit usage dashboard data
 * GET  /v3/govtribe/tools   — Discovered MCP tools (dry-run mode)
 * POST /v3/govtribe/sync    — Manual ingest trigger (admin only)
 * GET  /v3/govtribe/opp/:govtribe_id — Live detail proxy with caching
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import {
  getCreditBudgetStatus,
  getCycleCreditsUsed,
  getCycleCreditCap,
  listTools,
  mcpCallTool,
} from '../ingest/govtribe/mcp_client.js';
import { runIngest } from '../ingest/framework/registry.js';
import { isGovTribeEnabled } from '../ingest/govtribe/enabled.js';
import type { JwtPayload } from '../middleware/auth.js';

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
  app.addHook('onRequest', async (req, reply) => {
    if (!isGovTribeEnabled()) {
      return reply.send(
        successEnvelope(
          { enabled: false, status: 'disabled' },
          req.requestId,
        ),
      );
    }
  });

  /**
   * GET /v3/govtribe/health
   * Returns MCP reachability (inferred from last ingest run), last poll,
   * credit pct — no live MCP call, no credits burned.
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
   * Detailed credit usage for Sentinel UI — uses local aggregates, no MCP call.
   * Returns cycleCap, cycleUsed, monthKey, alertThreshold (960), stopThreshold (1140)
   * per V2 schema.
   */
  app.get('/v3/govtribe/credits', async (req, reply) => {
    const budgetStatus = await getCreditBudgetStatus();

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

    const monthlyCap = budgetStatus.credits_budget;
    const alertThreshold = Math.round(monthlyCap * 0.8);
    const stopThreshold = Math.round(monthlyCap * 0.95);

    return reply.send(
      successEnvelope(
        {
          cycleCap: getCycleCreditCap(),
          cycleUsed: getCycleCreditsUsed(),
          monthKey: budgetStatus.month,
          monthlyCap,
          monthlyUsed: budgetStatus.credits_used,
          alertThreshold,
          stopThreshold,
          monthlyAlertTriggered: budgetStatus.credits_used >= alertThreshold,
          monthlyStopTriggered: budgetStatus.credits_used >= stopThreshold,
          last_3_months: monthlyRows,
          top_endpoints: topEndpoints,
        },
        req.requestId,
      ),
    );
  });

  /**
   * GET /v3/govtribe/tools
   * Dry-run mode: lists discovered MCP tools without burning credits.
   */
  app.get('/v3/govtribe/tools', async (req, reply) => {
    try {
      const tools = await listTools();
      return reply.send(
        successEnvelope(
          {
            dry_run: true,
            tool_count: tools.length,
            tools: tools.map((t) => ({ name: t.name, description: t.description })),
          },
          req.requestId,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ source: 'govtribe', error: message }, 'govtribe_tools_list_error');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', `Failed to list MCP tools: ${message}`, req.requestId),
      );
    }
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
   * Proxy to live GovTribe detail via MCP with caching. Credit-budget enforced.
   * Used by Opp-Auto-Analysis for incumbent/agency/contact intel.
   */
  app.get<{ Params: { govtribe_id: string } }>(
    '/v3/govtribe/opp/:govtribe_id',
    async (req, reply) => {
      const { govtribe_id } = req.params;

      const result = await mcpCallTool(
        'Search_Federal_Contract_Opportunities',
        { query: govtribe_id, per_page: 1 },
        `opp_detail_${govtribe_id}`,
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

  /**
   * POST /v3/govtribe/search
   * Agent-facing search proxy. Calls Search_Federal_Contract_Opportunities MCP tool.
   * Credit-budget + cache + cycle cap enforced via mcpCallTool.
   * Body: { query, agency?, naics?, posted_within?, max_results? }
   */
  app.post('/v3/govtribe/search', async (req, reply) => {
    const body = req.body as {
      query?: string;
      agency?: string;
      naics?: string[];
      posted_within?: string;
      max_results?: number;
      caller?: string;
    };

    const query = body.query ?? '';
    if (!query) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'query is required', req.requestId),
      );
    }

    const maxResults = Math.min(body.max_results ?? 25, 100);

    const mcpArgs: Record<string, unknown> = {
      query,
      per_page: maxResults,
    };

    if (body.posted_within) {
      const match = body.posted_within.match(/^(\d+)d$/);
      if (match) {
        const days = parseInt(match[1], 10);
        const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
        mcpArgs['posted_date'] = { from };
      }
    }

    if (body.naics && body.naics.length > 0) {
      mcpArgs['naics_category_ids'] = body.naics;
    }

    const cacheId = `agent_search_${Buffer.from(JSON.stringify({ query, agency: body.agency, naics: body.naics, posted_within: body.posted_within, max_results: maxResults })).toString('base64').slice(0, 64)}`;

    const caller = body.caller ?? undefined;

    try {
      const result = await mcpCallTool(
        'Search_Federal_Contract_Opportunities',
        mcpArgs,
        cacheId,
        false,
        caller,
      );

      return reply.send(
        successEnvelope(
          {
            results: result.data,
            from_cache: result.from_cache,
            decision: result.decision,
            credits_used: result.credits_used,
            budget: result.budget_status,
          },
          req.requestId,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ source: 'govtribe', error: message }, 'govtribe_search_error');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', `GovTribe search failed: ${message}`, req.requestId),
      );
    }
  });
}
