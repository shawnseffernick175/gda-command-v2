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
import { getIngestInsertStatus } from '../ingest/framework/run_logger.js';
import { isResearchFeedsEnabled } from '../ingest/framework/research-feeds.js';
import type { JwtPayload } from '../middleware/auth.js';

/** Cron schedules — mirrors apps/backend-v3/src/cron/index.ts JOBS array */
const SCHEDULE_MAP: Record<string, { cron: string; intervalHours: number }> = {
  'sam.gov': { cron: '0 */4 * * *', intervalHours: 4 },
  'usaspending.gov': { cron: '0 7 * * *', intervalHours: 24 },
  'federalregister.gov': { cron: '15 */6 * * *', intervalHours: 6 },
  ...(isResearchFeedsEnabled()
    ? {
        'sbir': { cron: '0 9 * * *', intervalHours: 24 },
        'nsf': { cron: '0 8 * * *', intervalHours: 24 },
        'dod_rss': { cron: '30 22 * * *', intervalHours: 24 },
        'nih': { cron: '0 7 * * 1', intervalHours: 168 },
        'arxiv': { cron: '0 6 * * 1', intervalHours: 168 },
      }
    : {}),
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

type SourceStatus = 'healthy' | 'degraded' | 'stale' | 'error' | 'unknown';

export interface LatestRun {
  status: string;
  rows_inserted: number;
  rows_updated: number;
  rows_skipped: number;
  started_at: string | null;
  finished_at: string | null;
  error_text: string | null;
  log_lines: string[] | null;
}

/**
 * Derive a health status that reflects whether the source actually
 * AUTHENTICATED and RETURNED DATA — not merely that the cron ran.
 *
 * Green (healthy) requires the most recent completed run to have succeeded,
 * returned data, and successfully inserted rows within the expected interval.
 */
export function deriveStatus(params: {
  latest: LatestRun | undefined;
  lastInsertAt: string | null;
  everInserted: boolean;
  intervalHours: number;
  hasRecentError: boolean;
  now?: number;
}): SourceStatus {
  const { latest, lastInsertAt, everInserted, intervalHours, hasRecentError } = params;
  const now = params.now ?? Date.now();

  if (!latest) return 'unknown';
  if (latest.status === 'error' || hasRecentError) return 'error';
  if (latest.status === 'degraded') return 'degraded';
  if (latest.status !== 'success') return 'unknown';

  const expectedIntervalMs = intervalHours * 3600 * 1000;
  const rowsThisRun =
    (latest.rows_inserted ?? 0) +
    (latest.rows_updated ?? 0) +
    (latest.rows_skipped ?? 0);

  if (rowsThisRun === 0) return 'degraded';
  if (!everInserted || !lastInsertAt) return 'degraded';

  if (now - new Date(lastInsertAt).getTime() > expectedIntervalMs) return 'stale';
  return 'healthy';
}

function computeNextRun(lastRunAt: string | null, intervalHours: number): string | null {
  if (!lastRunAt) return null;
  const last = new Date(lastRunAt);
  const next = new Date(last.getTime() + intervalHours * 3600 * 1000);
  return next.toISOString();
}

interface ComputedSource {
  sourceKey: string;
  label: string;
  status: SourceStatus;
  lastRunAt: string | null;
  durationSeconds: number | null;
  records: { fetched: number; new: number; updated: number; skipped: number };
  nextRunAt: string | null;
  intervalHours: number;
  lastError: string | null;
  lastInsertAt: string | null;
  logLines: string[];
}

/**
 * Compute per-source health + timing for every registered source. Shared by the
 * detailed status endpoint and the lightweight health-count endpoint so both
 * agree on what "healthy" means.
 */
async function computeSources(): Promise<ComputedSource[]> {
  const registered = getRegisteredSourcesWithLabels();
  const insertStatus = await getIngestInsertStatus();
  const insertMap = new Map(insertStatus.map((s) => [s.source_key, s]));

  // Latest COMPLETED run per source — drives status + displayed record counts.
  const { rows: latestRuns } = await pool.query(
    `SELECT DISTINCT ON (source_key)
            source_key, started_at, finished_at,
            rows_inserted, rows_updated, rows_skipped,
            status, error_text, log_lines
     FROM ingest_runs
     WHERE finished_at IS NOT NULL
     ORDER BY source_key, finished_at DESC`,
  );
  const latestRunMap = new Map(latestRuns.map((r) => [r.source_key, r]));

  // Recent hard errors (last 24h) with no later success/degraded run.
  const { rows: errorRows } = await pool.query(
    `SELECT DISTINCT ON (source_key) source_key, error_text
     FROM ingest_runs e
     WHERE e.status = 'error'
       AND e.started_at > NOW() - INTERVAL '24 hours'
       AND NOT EXISTS (
         SELECT 1 FROM ingest_runs s
         WHERE s.source_key = e.source_key
           AND s.status IN ('success', 'degraded')
           AND s.started_at > e.started_at
       )
     ORDER BY source_key, started_at DESC`,
  );
  const recentErrors = new Map<string, string>();
  for (const r of errorRows) {
    if (!recentErrors.has(r.source_key)) recentErrors.set(r.source_key, r.error_text);
  }

  const { rows: lastErrorRows } = await pool.query(
    `SELECT DISTINCT ON (source_key) source_key, error_text
     FROM ingest_runs
     WHERE error_text IS NOT NULL
     ORDER BY source_key, finished_at DESC NULLS LAST, started_at DESC`,
  );
  const lastErrors = new Map<string, string>(
    lastErrorRows.map((r) => [r.source_key, r.error_text]),
  );

  return registered.map(({ key: sourceKey, label }) => {
    const latest = latestRunMap.get(sourceKey) as LatestRun | undefined;
    const insert = insertMap.get(sourceKey);
    const schedule = SCHEDULE_MAP[sourceKey];
    const intervalHours = schedule?.intervalHours ?? 24;
    const hasRecentError = recentErrors.has(sourceKey);
    const lastInsertAt = insert?.last_insert_at ?? null;
    const everInserted = insert?.ever_inserted ?? false;

    const lastRunAt = latest?.finished_at ?? null;
    const durationSeconds = latest?.finished_at && latest?.started_at
      ? Math.round(
          (new Date(latest.finished_at).getTime() - new Date(latest.started_at).getTime()) / 1000,
        )
      : null;

    const status = deriveStatus({
      latest,
      lastInsertAt,
      everInserted,
      intervalHours,
      hasRecentError,
    });

    const lastError = lastErrors.get(sourceKey) ?? null;

    return {
      sourceKey,
      label,
      status,
      lastRunAt,
      durationSeconds,
      records: {
        fetched: (latest?.rows_inserted ?? 0) + (latest?.rows_updated ?? 0) + (latest?.rows_skipped ?? 0),
        new: latest?.rows_inserted ?? 0,
        updated: latest?.rows_updated ?? 0,
        skipped: latest?.rows_skipped ?? 0,
      },
      nextRunAt: computeNextRun(lastRunAt, intervalHours),
      intervalHours,
      lastError,
      lastInsertAt,
      logLines: latest?.log_lines ?? [],
    };
  });
}

export async function ingestStatusRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v3/ingest/status — full pipeline status for all sources.
   * Returns per-source health, timing, record counts, credits.
   */
  app.get('/v3/ingest/status', async (req, reply) => {
    const computed = await computeSources();

    const sources = computed.map((c) => {
      const entry: Record<string, unknown> = {
        source_key: c.sourceKey,
        display_name: c.label,
        status: c.status,
        last_run_at: c.lastRunAt,
        last_run_duration_seconds: c.durationSeconds,
        records_last_run: c.records,
        next_run_at: c.nextRunAt,
        scheduled_interval_hours: c.intervalHours,
        last_error: c.lastError,
        last_success_at: c.lastInsertAt,
        log_lines: c.logLines,
      };

      return entry;
    });

    return reply.send(successEnvelope(sources, req.requestId));
  });

  /**
   * GET /v3/ingest/health — lightweight degraded/stale/error counts (no auth).
   * Used by frontend banner to poll for degraded state. Uses the same status
   * derivation as /status so the two never disagree.
   */
  app.get('/v3/ingest/health', async (req, reply) => {
    const computed = await computeSources();

    let staleCount = 0;
    let errorCount = 0;

    for (const c of computed) {
      if (c.status === 'error' || c.status === 'degraded') {
        errorCount++;
      } else if (c.status === 'stale') {
        staleCount++;
      }
    }

    return reply.send({ stale_count: staleCount, error_count: errorCount });
  });

  /**
   * POST /v3/ingest/trigger/:source — fire named ingest job immediately (admin only).
   */
  app.post('/v3/ingest/trigger/:source', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
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
