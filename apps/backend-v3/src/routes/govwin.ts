/**
 * GovWin IQ API routes — health, manual sync, and opp detail proxy.
 * All routes gated behind GOVWIN_CONNECTOR_V1 feature flag.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import { getAuthHealth } from '../services/govwin/auth.js';
import { fetchOpportunityByIdApi } from '../services/govwin/api_client.js';
import { runIngest } from '../ingest/framework/registry.js';
import { pool } from '../lib/db.js';
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

export async function govwinRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/govwin/health', async (req, reply) => {
    const auth = await getAuthHealth();

    let lastPollAt: string | null = null;
    try {
      const { rows } = await pool.query(
        `SELECT MAX(finished_at) AS last_poll
         FROM ingest_runs
         WHERE source_key = 'govwin'
           AND status IN ('success', 'degraded')`,
      );
      lastPollAt = rows[0]?.last_poll
        ? new Date(rows[0].last_poll).toISOString()
        : null;
    } catch {
      /* ignore */
    }

    return reply.send(
      successEnvelope(
        {
          token_valid: auth.token_valid,
          expires_in_minutes: auth.expires_in_minutes,
          last_poll_at: lastPollAt,
          last_error: auth.last_error,
        },
        req.requestId,
      ),
    );
  });

  app.post('/v3/govwin/sync', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const query = req.query as { endpoint?: string; dry_run?: string };
    const dryRun = query.dry_run === 'true';

    if (dryRun) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS count FROM opportunities WHERE data_source = 'govwin'`,
      );
      return reply.send(
        successEnvelope(
          {
            dry_run: true,
            existing_govwin_rows: parseInt(rows[0].count, 10),
            message: 'Dry run — no data written',
          },
          req.requestId,
        ),
      );
    }

    try {
      const user = (req as FastifyRequest & { user?: JwtPayload }).user;
      logger.info({ triggeredBy: user?.sub }, 'govwin_manual_sync');

      const { runId, result, durationMs } = await runIngest('govwin');
      return reply.send(
        successEnvelope(
          {
            run_id: String(runId),
            rows_inserted: result.inserted,
            rows_updated: result.updated,
            rows_skipped: result.skipped,
            duration_ms: durationMs,
          },
          req.requestId,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message }, 'govwin_sync_error');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', message, req.requestId),
      );
    }
  });

  app.get<{ Params: { govwinId: string } }>(
    '/v3/govwin/opp/:govwinId',
    async (req, reply) => {
      const { govwinId } = req.params;

      if (!/^\d+$/.test(govwinId)) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'govwinId must be numeric', req.requestId),
        );
      }

      try {
        const { rows: cacheRows } = await pool.query(
          `SELECT raw_payload, fetched_at FROM govwin_cache
           WHERE govwin_id = $1 AND endpoint = 'opportunities'
             AND fetched_at > NOW() - INTERVAL '1 hour'
           LIMIT 1`,
          [govwinId],
        );

        if (cacheRows[0]) {
          return reply.send(
            successEnvelope(
              {
                govwin_id: govwinId,
                cached: true,
                fetched_at: new Date(cacheRows[0].fetched_at).toISOString(),
                data: cacheRows[0].raw_payload,
                source_uri: `https://iq.govwin.com/neo/opportunity/view/${govwinId}`,
              },
              req.requestId,
            ),
          );
        }

        const opp = await fetchOpportunityByIdApi(govwinId);
        if (!opp) {
          return reply.status(404).send(
            errorEnvelope('NOT_FOUND', `GovWin opportunity ${govwinId} not found`, req.requestId),
          );
        }

        const payload = {
          title: opp.title,
          agency: opp.agency,
          subAgency: opp.subAgency,
          solicitationNumber: opp.solicitationNumber,
          status: opp.status,
          naics: opp.naics,
          setAside: opp.setAside,
          incumbent: opp.incumbent,
          competitors: opp.competitors,
          valueMin: opp.valueMin,
          valueMax: opp.valueMax,
          responseDueAt: opp.responseDueAt,
          postedAt: opp.postedAt,
          description: opp.description?.slice(0, 5000) ?? null,
        };

        await pool.query(
          `INSERT INTO govwin_cache (govwin_id, endpoint, raw_payload)
           VALUES ($1, 'opportunities', $2)
           ON CONFLICT (govwin_id, endpoint)
           DO UPDATE SET raw_payload = $2, fetched_at = NOW()`,
          [govwinId, JSON.stringify(payload)],
        );

        return reply.send(
          successEnvelope(
            {
              govwin_id: govwinId,
              cached: false,
              fetched_at: new Date().toISOString(),
              data: payload,
              source_uri: opp.sourceUri,
            },
            req.requestId,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ govwinId, error: message }, 'govwin_opp_detail_error');
        return reply.status(502).send(
          errorEnvelope('INTERNAL_ERROR', `GovWin fetch failed: ${message}`, req.requestId),
        );
      }
    },
  );
}
