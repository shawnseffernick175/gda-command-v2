/**
 * GovTribe Saved Search routes — individual search execution with rate-limit.
 *
 * POST /v3/govtribe/saved-search/dry-run  — estimate credits, log dry_run row
 * POST /v3/govtribe/saved-search/run      — execute single search, spend credits
 *
 * Rate-limit gate: same savedSearchId cannot run twice in one cycle window.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import { GOVTRIBE_SAVED_SEARCHES } from '../ingest/govtribe/saved_searches.js';
import {
  getCreditBudgetStatus,
  resetCycleCredits,
  getCycleCreditsUsed,
  getCycleCreditCap,
} from '../ingest/govtribe/mcp_client.js';
import { searchOpportunities, searchAwards, searchForecasts } from '../ingest/govtribe/mcp_tools.js';
import { mapGovTribeOpportunity } from '../ingest/govtribe/mapper.js';
import { upsertExternalOpportunity } from '../ingest/framework/source_writer.js';
import { ingestGovTribeToRag } from '../ingest/govtribe/rag_sink.js';
import type { GovTribeOpportunityRaw } from '../ingest/govtribe/types.js';
import type { JwtPayload } from '../middleware/auth.js';

/** Cycle window in hours — searches cannot re-run within this window. */
const CYCLE_WINDOW_HOURS = parseInt(process.env['GOVTRIBE_CYCLE_WINDOW_HOURS'] ?? '48', 10);

interface SavedSearchBody {
  savedSearchId?: string;
  dryRun?: boolean;
  maxPages?: number;
  caller?: string;
}

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

export async function govtribeSavedSearchRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /v3/govtribe/saved-search/dry-run
   * Returns credit estimate without spending. Logs a dry_run=true ledger row.
   */
  app.post('/v3/govtribe/saved-search/dry-run', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const body = req.body as SavedSearchBody | undefined;
    const savedSearchId = body?.savedSearchId;

    if (!savedSearchId) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'savedSearchId is required', req.requestId),
      );
    }

    const search = GOVTRIBE_SAVED_SEARCHES.find((s) => s.id === savedSearchId);
    if (!search) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Saved search "${savedSearchId}" not found`, req.requestId),
      );
    }

    const maxPages = body?.maxPages ?? 1;
    const creditsEstimated = search.expectedCreditsPerPage * maxPages;
    const caller = body?.caller ?? 'manual';

    // Log dry_run row in ledger
    await pool.query(
      `INSERT INTO govtribe_credit_ledger
         (endpoint, cost_credits, decision, dry_run, caller, saved_search_id)
       VALUES ($1, 0, 'called', TRUE, $2, $3)`,
      [search.mcpTool, caller, savedSearchId],
    );

    // Log to saved_search_runs
    await pool.query(
      `INSERT INTO govtribe_saved_search_runs
         (saved_search_id, caller, dry_run, credits_used, status, finished_at)
       VALUES ($1, $2, TRUE, 0, 'dry_run', NOW())`,
      [savedSearchId, caller],
    );

    return reply.send(
      successEnvelope(
        {
          ok: true,
          creditsEstimated,
          creditsActual: 0,
          savedSearch: savedSearchId,
          search: {
            name: search.name,
            category: search.category,
            mcpTool: search.mcpTool,
            maxPages,
          },
        },
        req.requestId,
      ),
    );
  });

  /**
   * POST /v3/govtribe/saved-search/run
   * Execute a single saved search. Credit-budget + rate-limit enforced.
   */
  app.post('/v3/govtribe/saved-search/run', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const body = req.body as SavedSearchBody | undefined;
    const savedSearchId = body?.savedSearchId;

    if (!savedSearchId) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'savedSearchId is required', req.requestId),
      );
    }

    const search = GOVTRIBE_SAVED_SEARCHES.find((s) => s.id === savedSearchId);
    if (!search) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Saved search "${savedSearchId}" not found`, req.requestId),
      );
    }

    const maxPages = body?.maxPages ?? 1;
    const caller = body?.caller ?? 'manual-smoke';

    // Rate-limit gate: check if this search was already run in the current cycle
    const { rows: recentRuns } = await pool.query(
      `SELECT id, created_at FROM govtribe_saved_search_runs
       WHERE saved_search_id = $1
         AND dry_run = FALSE
         AND status = 'success'
         AND created_at > NOW() - ($2 || ' hours')::INTERVAL
       ORDER BY created_at DESC LIMIT 1`,
      [savedSearchId, String(CYCLE_WINDOW_HOURS)],
    );

    if (recentRuns.length > 0) {
      // Log throttled attempt
      await pool.query(
        `INSERT INTO govtribe_saved_search_runs
           (saved_search_id, caller, dry_run, credits_used, status, error_text, finished_at)
         VALUES ($1, $2, FALSE, 0, 'throttled', 'cycle-cap-pending', NOW())`,
        [savedSearchId, caller],
      );

      return reply.status(429).send({
        success: false,
        throttled: true,
        reason: 'cycle-cap-pending',
        lastRunAt: recentRuns[0].created_at,
        cycleWindowHours: CYCLE_WINDOW_HOURS,
        requestId: req.requestId,
      });
    }

    // Budget check
    const budgetStatus = await getCreditBudgetStatus();
    if (budgetStatus.pct >= 95) {
      return reply.status(429).send({
        success: false,
        throttled: true,
        reason: 'monthly-budget-exhausted',
        budget: budgetStatus,
        requestId: req.requestId,
      });
    }

    // Execute the search
    resetCycleCredits();
    const startedAt = new Date();
    let totalCreditsUsed = 0;
    let rowsFetched = 0;
    let rowsInserted = 0;
    let rowsUpdated = 0;

    try {
      for (let page = 1; page <= maxPages; page++) {
        const cacheId = `saved_search_${savedSearchId}_page_${page}`;
        const perPage = search.maxResults;

        let result;
        switch (search.category) {
          case 'opportunities':
            result = await searchOpportunities(
              { query: search.keywords.join(' | '), naicsCodes: search.naicsFilter, perPage, page },
              cacheId,
            );
            break;
          case 'awards':
            result = await searchAwards(
              { query: search.keywords.join(' | '), naicsCodes: search.naicsFilter, perPage, page },
              cacheId,
            );
            break;
          case 'forecasts':
            result = await searchForecasts(
              { query: search.keywords.join(' | '), naicsCodes: search.naicsFilter, perPage, page },
              cacheId,
            );
            break;
        }

        totalCreditsUsed += result.credits_used;

        if (result.decision !== 'called') {
          logger.warn(
            { source: 'govtribe', search: savedSearchId, decision: result.decision, page },
            'govtribe_saved_search_budget_skip',
          );
          break;
        }

        // Process results
        const responseData = result.data as Record<string, unknown> | null;
        const opps = (
          responseData?.data ??
          responseData?.rows ??
          (Array.isArray(responseData) ? responseData : [])
        ) as GovTribeOpportunityRaw[];

        rowsFetched += opps.length;

        if (search.category === 'opportunities') {
          for (const raw of opps) {
            try {
              const mapped = mapGovTribeOpportunity(raw);
              if (!mapped) continue;

              const outcome = await upsertExternalOpportunity(mapped.opportunity, mapped.citations, 'govtribe');
              if (outcome === 'inserted') rowsInserted++;
              else if (outcome === 'updated') rowsUpdated++;

              // Backfill govtribe_id + source_uri
              await pool.query(
                `UPDATE opportunities
                 SET source_uri = $1, govtribe_id = $2
                 WHERE data_source = 'govtribe' AND external_id = $3
                   AND (source_uri IS DISTINCT FROM $1 OR govtribe_id IS DISTINCT FROM $2)`,
                [mapped.source_uri, mapped.govtribe_id, mapped.govtribe_id],
              );

              await ingestGovTribeToRag(raw, search.name).catch((err) => {
                logger.error(
                  { source: 'govtribe', govtribeId: raw._id ?? raw.id, error: err instanceof Error ? err.message : String(err) },
                  'govtribe_saved_search_rag_error',
                );
              });
            } catch (err) {
              logger.error(
                { source: 'govtribe', govtribeId: raw._id ?? raw.id, error: err instanceof Error ? err.message : String(err) },
                'govtribe_saved_search_row_error',
              );
            }
          }
        }

        if (opps.length < perPage) break;
      }

      // Log the run
      await pool.query(
        `INSERT INTO govtribe_saved_search_runs
           (saved_search_id, caller, dry_run, credits_used, rows_fetched, rows_inserted, rows_updated, status, started_at, finished_at)
         VALUES ($1, $2, FALSE, $3, $4, $5, $6, 'success', $7, NOW())`,
        [savedSearchId, caller, totalCreditsUsed, rowsFetched, rowsInserted, rowsUpdated, startedAt],
      );

      // Log ledger entry for the full run
      await pool.query(
        `INSERT INTO govtribe_credit_ledger
           (endpoint, cost_credits, decision, dry_run, caller, saved_search_id)
         VALUES ($1, $2, 'called', FALSE, $3, $4)`,
        [search.mcpTool, totalCreditsUsed, caller, savedSearchId],
      );

      logger.info(
        { source: 'govtribe', search: savedSearchId, totalCreditsUsed, rowsFetched, rowsInserted, rowsUpdated },
        'govtribe_saved_search_run_complete',
      );

      return reply.send(
        successEnvelope(
          {
            ok: true,
            savedSearch: savedSearchId,
            creditsUsed: totalCreditsUsed,
            rowsFetched,
            rowsInserted,
            rowsUpdated,
            cycleCredits: getCycleCreditsUsed(),
            cycleCap: getCycleCreditCap(),
            budget: budgetStatus,
          },
          req.requestId,
        ),
      );
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      logger.error(
        { source: 'govtribe', search: savedSearchId, error: errorText },
        'govtribe_saved_search_run_error',
      );

      await pool.query(
        `INSERT INTO govtribe_saved_search_runs
           (saved_search_id, caller, dry_run, credits_used, rows_fetched, rows_inserted, rows_updated, status, error_text, started_at, finished_at)
         VALUES ($1, $2, FALSE, $3, $4, $5, $6, 'error', $7, $8, NOW())`,
        [savedSearchId, caller, totalCreditsUsed, rowsFetched, rowsInserted, rowsUpdated, errorText, startedAt],
      );

      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', errorText, req.requestId),
      );
    }
  });
}
