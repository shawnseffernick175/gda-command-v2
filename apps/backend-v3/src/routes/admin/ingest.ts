/**
 * Admin ingest routes — manual trigger, recent runs, and status.
 * Auth: requires JWT with role=admin.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { successEnvelope, errorEnvelope } from '../../lib/envelope.js';
import { logger } from '../../lib/logger.js';
import { runIngest, getRegisteredSources } from '../../ingest/framework/registry.js';
import { getRecentRuns, getIngestStatus } from '../../ingest/framework/run_logger.js';
import { runBackfill } from '../../ingest/usaspending/backfill.js';
import { backfillVehicleDetection } from '../../services/vehicles/detector.js';
import type { JwtPayload } from '../../middleware/auth.js';

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

export async function adminIngestRoutes(app: FastifyInstance): Promise<void> {
  // POST /v3/admin/ingest/run/:source — manual trigger
  app.post('/v3/admin/ingest/run/:source', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const { source } = req.params as { source: string };
    const registered = getRegisteredSources();

    if (!registered.includes(source)) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Unknown source: ${source}. Available: ${registered.join(', ')}`, req.requestId),
      );
    }

    try {
      const user = (req as FastifyRequest & { user?: JwtPayload }).user;
      logger.info({ source, triggeredBy: user?.sub }, 'admin_ingest_trigger');

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
            ...(result.stats ? { stats: result.stats } : {}),
            ...(result.degradedReason ? { degraded_reason: result.degradedReason } : {}),
          },
          req.requestId,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ source, error: message }, 'admin_ingest_trigger_error');

      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', message, req.requestId),
      );
    }
  });

  // GET /v3/admin/ingest/runs — recent runs
  app.get('/v3/admin/ingest/runs', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    try {
      const { source, limit: limitStr } = req.query as { source?: string; limit?: string };
      const limit = limitStr ? parseInt(limitStr, 10) : 50;

      const runs = await getRecentRuns(source, isNaN(limit) ? 50 : limit);

      return reply.send(successEnvelope({ runs }, req.requestId));
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'admin_ingest_runs_error');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', (err as Error).message, req.requestId),
      );
    }
  });

  // GET /v3/admin/ingest/status — last successful run per source
  app.get('/v3/admin/ingest/status', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    try {
      const status = await getIngestStatus();
      const registered = getRegisteredSources();

      return reply.send(
        successEnvelope({ registered_sources: registered, status }, req.requestId),
      );
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'admin_ingest_status_error');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', (err as Error).message, req.requestId),
      );
    }
  });

  // POST /v3/admin/ingest/backfill/usaspending.gov — one-shot N-day backfill
  app.post('/v3/admin/ingest/backfill/usaspending.gov', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const { days: daysStr } = req.query as { days?: string };
    const days = daysStr ? parseInt(daysStr, 10) : 30;

    if (isNaN(days) || days < 1 || days > 90) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'days must be between 1 and 90', req.requestId),
      );
    }

    try {
      const user = (req as FastifyRequest & { user?: JwtPayload }).user;
      logger.info({ days, triggeredBy: user?.sub }, 'admin_backfill_usaspending_trigger');

      const result = await runBackfill({ days });

      return reply.send(successEnvelope(result, req.requestId));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message }, 'admin_backfill_usaspending_error');

      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', message, req.requestId),
      );
    }
  });

  // POST /v3/admin/ingest/usaspending-backfill — full-year backfill (365 days)
  app.post('/v3/admin/ingest/usaspending-backfill', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    try {
      const user = (req as FastifyRequest & { user?: JwtPayload }).user;
      logger.info({ days: 365, triggeredBy: user?.sub }, 'admin_backfill_usaspending_full_year');

      // Fire-and-forget: respond 202 immediately, run backfill in background
      void runBackfill({ days: 365 }).catch((err) => {
        logger.error({ error: err instanceof Error ? err.message : String(err) }, 'admin_backfill_usaspending_full_year_error');
      });

      return reply.status(202).send(
        successEnvelope({ status: 'accepted', days: 365, message: 'Full-year backfill started in background' }, req.requestId),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message }, 'admin_backfill_usaspending_full_year_error');

      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', message, req.requestId),
      );
    }
  });

  // POST /v3/admin/vehicles/backfill — tag existing opportunities with vehicle matches
  app.post('/v3/admin/vehicles/backfill', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    try {
      const user = (req as FastifyRequest & { user?: JwtPayload }).user;
      logger.info({ triggeredBy: user?.sub }, 'admin_vehicles_backfill_trigger');

      // Fire-and-forget: respond 202 immediately, run backfill in background
      void backfillVehicleDetection().then((result) => {
        logger.info(result, 'admin_vehicles_backfill_complete');
      }).catch((err) => {
        logger.error({ error: err instanceof Error ? err.message : String(err) }, 'admin_vehicles_backfill_error');
      });

      return reply.status(202).send(
        successEnvelope({ status: 'accepted', message: 'Vehicle backfill started in background' }, req.requestId),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message }, 'admin_vehicles_backfill_error');

      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', message, req.requestId),
      );
    }
  });
}
