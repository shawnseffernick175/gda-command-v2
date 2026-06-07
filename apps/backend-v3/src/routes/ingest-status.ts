/**
 * Ingest status routes — public health check + detailed pipeline status.
 *
 * GET /v3/ingest/status  — full pipeline status (requires auth)
 * GET /v3/ingest/health  — lightweight stale/error counts (no auth)
 * POST /v3/ingest/trigger/:source — fire named cron job (admin only)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import { getRegisteredSourcesWithLabels, runIngest, getRegisteredSources } from '../ingest/framework/registry.js';
import { getIngestStatus } from '../ingest/framework/run_logger.js';
import { getCreditBudgetStatus } from '../ingest/govtribe/mcp_client.js';
import type { JwtPayload } from '../middleware/auth.js';

/** Cron schedules — mirrors apps/backend-v3/src/cron/index.ts JOBS array */
const SCHEDULE_MAP: Record<string, { cron: string; intervalHours: number }> = {
  'sam.gov': { cron: '0 */4 * * *', intervalHours: 4 },
  'usaspending.gov': { cron: '0 7 * * *', intervalHours: 24 },
  'federalregister.gov': { cron: '15 */6 * * *', intervalHours: 6 },
  'sbir': { cron: '0 9 * * *', intervalHours: 24 },
  'nsf': { cron: '0 8 * * *', intervalHours: 24 },
  'dod_rss': { cron: '30 22 * * *', intervalHours: 24 },
  'nih': { cron: '0 7 * * 1', intervalHours: 168 },
  'arxiv': { cron: '0 6 * * 1', intervalHours: 168 },
  'govtribe': { cron: '0 10 * * 1,4', intervalHours: 84 },
  'govtribe.contacts': { cron: '0 9 * * 1', intervalHours: 168 },
  'govtribe.vehicles': { cron: '0 6 1 * *', intervalHours: 720 },
  'govtribe.budget': { cron: '55 3 * * *', intervalHours: 24 },
  'govwin': { cron: '0 */6 * * *', intervalHours: 6 },
  'grants.gov': { cron: '0 11 * * *', intervalHours: 24 },
};

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

function deriveStatus(
  lagSeconds: number | null,
  intervalHours: number,
  hasRecentError: boolean,
): 'healthy' | 'stale' | 'error' | 'unknown' {
  if (hasRecentError) return 'error';
  if (lagSeconds === null) return 'unknown';
  const threshold = intervalHours * 2 * 3600;
  return lagSeconds > threshold ? 'stale' : 'healthy';
}

function computeNextRun(lastRunAt: string | null, intervalHours: number): string | null {
  if (!lastRunAt) return null;
  const last = new Date(lastRunAt);
  const next = new Date(last.getTime() + intervalHours * 3600 * 1000);
  return next.toISOString();
}

export async function ingestStatusRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v3/ingest/status — full pipeline status for all sources.
   * Returns per-source health, timing, record counts, credits.
   */
  app.get('/v3/ingest/status', async (req, reply) => {
    const registered = getRegisteredSourcesWithLabels();
    const ingestStatus = await getIngestStatus();
    const ingestMap = new Map(ingestStatus.map((s) => [s.source_key, s]));

    // Get latest run details per source (records, duration, error)
    const { rows: latestRuns } = await pool.query(
      `SELECT DISTINCT ON (source_key)
              source_key, started_at, finished_at,
              rows_inserted, rows_updated, rows_skipped,
              status, error_text, log_lines
       FROM ingest_runs
       ORDER BY source_key, started_at DESC`,
    );
    const latestRunMap = new Map(latestRuns.map((r) => [r.source_key, r]));

    // Recent errors (last 24h)
    const { rows: errorRows } = await pool.query(
      `SELECT source_key, error_text
       FROM ingest_runs
       WHERE status = 'error'
         AND started_at > NOW() - INTERVAL '24 hours'
       ORDER BY started_at DESC`,
    );
    const recentErrors = new Map<string, string>();
    for (const r of errorRows) {
      if (!recentErrors.has(r.source_key)) {
        recentErrors.set(r.source_key, r.error_text);
      }
    }

    // GovTribe credits
    let govtribeCredits = { credits_used: 0, credits_budget: 1200, pct: 0, last_call_at: null as string | null };
    try {
      govtribeCredits = await getCreditBudgetStatus();
    } catch {
      // Tables may not exist
    }

    const sources = registered.map(({ key: sourceKey, label }) => {
      const ingest = ingestMap.get(sourceKey);
      const latest = latestRunMap.get(sourceKey);
      const schedule = SCHEDULE_MAP[sourceKey];
      const intervalHours = schedule?.intervalHours ?? 24;
      const lagSeconds = ingest?.lag_seconds ?? null;
      const hasRecentError = recentErrors.has(sourceKey);

      const lastRunAt = latest?.started_at ?? null;
      const finishedAt = latest?.finished_at ?? null;
      const durationSeconds = (lastRunAt && finishedAt)
        ? Math.round((new Date(finishedAt).getTime() - new Date(lastRunAt).getTime()) / 1000)
        : null;

      const status = deriveStatus(lagSeconds, intervalHours, hasRecentError);
      const nextRunAt = computeNextRun(ingest?.last_success_at ?? null, intervalHours);

      const entry: Record<string, unknown> = {
        source_key: sourceKey,
        display_name: label,
        status,
        last_run_at: lastRunAt,
        last_run_duration_seconds: durationSeconds,
        records_last_run: {
          fetched: (latest?.rows_inserted ?? 0) + (latest?.rows_updated ?? 0) + (latest?.rows_skipped ?? 0),
          new: latest?.rows_inserted ?? 0,
          updated: latest?.rows_updated ?? 0,
          skipped: latest?.rows_skipped ?? 0,
        },
        next_run_at: nextRunAt,
        scheduled_interval_hours: intervalHours,
        last_error: recentErrors.get(sourceKey) ?? null,
        log_lines: latest?.log_lines ?? [],
      };

      if (sourceKey === 'govtribe' || sourceKey.startsWith('govtribe.')) {
        entry.credits = {
          used: govtribeCredits.credits_used,
          budget: govtribeCredits.credits_budget,
          pct: govtribeCredits.pct,
        };
      }

      return entry;
    });

    return reply.send(successEnvelope(sources, req.requestId));
  });

  /**
   * GET /v3/ingest/health — lightweight stale/error counts (no auth needed).
   * Used by frontend banner to poll for degraded state.
   */
  app.get('/v3/ingest/health', async (req, reply) => {
    const registered = getRegisteredSourcesWithLabels();
    const ingestStatus = await getIngestStatus();
    const ingestMap = new Map(ingestStatus.map((s) => [s.source_key, s]));

    const { rows: errorRows } = await pool.query(
      `SELECT DISTINCT source_key
       FROM ingest_runs
       WHERE status = 'error'
         AND started_at > NOW() - INTERVAL '24 hours'`,
    );
    const errorSources = new Set(errorRows.map((r) => r.source_key));

    let staleCount = 0;
    let errorCount = 0;

    for (const { key: sourceKey } of registered) {
      const ingest = ingestMap.get(sourceKey);
      const schedule = SCHEDULE_MAP[sourceKey];
      const intervalHours = schedule?.intervalHours ?? 24;
      const lagSeconds = ingest?.lag_seconds ?? null;
      const hasRecentError = errorSources.has(sourceKey);

      const status = deriveStatus(lagSeconds, intervalHours, hasRecentError);

      // Only count as stale/error if condition persists > 24h
      if (status === 'error') {
        errorCount++;
      } else if (status === 'stale' && lagSeconds !== null && lagSeconds > 86400) {
        staleCount++;
      }
    }

    return reply.send({ stale_count: staleCount, error_count: errorCount });
  });

  /**
   * POST /v3/ingest/trigger/:source — fire named ingest job immediately (admin only).
   */
  app.post('/v3/ingest/trigger/:source', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const { source } = req.params as { source: string };
    const registeredKeys = getRegisteredSources();

    if (!registeredKeys.includes(source)) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Unknown source: ${source}. Available: ${registeredKeys.join(', ')}`, req.requestId),
      );
    }

    try {
      const user = (req as FastifyRequest & { user?: JwtPayload }).user;
      logger.info({ source, triggeredBy: user?.sub }, 'ingest_trigger_manual');

      const { runId, result, durationMs } = await runIngest(source);

      return reply.send(
        successEnvelope(
          {
            run_id: String(runId),
            source_key: source,
            rows_inserted: result.inserted,
            rows_updated: result.updated,
            rows_skipped: result.skipped,
            status: result.degraded ? 'degraded' : 'success',
            duration_ms: durationMs,
          },
          req.requestId,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ source, error: message }, 'ingest_trigger_error');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', message, req.requestId),
      );
    }
  });
}
