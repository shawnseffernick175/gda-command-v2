import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';

interface SoakEvent {
  kind: string;
  url?: string;
  status?: number;
  durationMs?: number;
  message?: string;
  ts?: string;
}

interface SoakPayload {
  apiVersion?: string;
  events: SoakEvent[];
}

export async function soakRoutes(app: FastifyInstance): Promise<void> {
  /** Receive batched soak events from the frontend reporter. */
  app.post('/v3/soak-metrics', async (req, reply) => {
    const body = req.body as SoakPayload | undefined;
    if (!body?.events?.length) {
      return reply.status(200).send(successEnvelope({ accepted: 0 }, req.requestId));
    }

    const apiVersion = body.apiVersion ?? 'v3';
    const events = body.events.slice(0, 200);

    try {
      const values: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      for (const e of events) {
        values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5})`);
        params.push(e.kind, e.url ?? null, e.status ?? null, e.durationMs ?? null, e.message ?? null, apiVersion);
        idx += 6;
      }

      await pool.query(
        `INSERT INTO soak_events (kind, url, status, duration_ms, message, api_version)
         VALUES ${values.join(', ')}`,
        params,
      );
    } catch (err) {
      logger.warn({ err }, 'Failed to insert soak events');
    }

    return reply.status(200).send(successEnvelope({ accepted: events.length }, req.requestId));
  });

  /** Sentinel reads rolled-up daily metrics. */
  app.get('/v3/soak-metrics', async (req, reply) => {
    const query = req.query as { days?: string };
    const days = Math.min(parseInt(query.days ?? '30', 10) || 30, 90);

    const result = await pool.query(
      `SELECT day, kind, count, p95_ms, api_version
       FROM soak_metrics
       WHERE day >= CURRENT_DATE - $1::int
       ORDER BY day DESC, kind`,
      [days],
    );

    return reply.status(200).send(successEnvelope(result.rows, req.requestId));
  });
}
