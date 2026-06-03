/**
 * Report routes (F-441).
 *
 *   GET /v3/reports/funnel — conversion funnel snapshot.
 *
 * Same auth as sibling endpoints (JWT via authHook).
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { buildFunnelReport } from '../services/reports/funnel.js';

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/reports/funnel', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const raw = query.window_days;

    if (raw !== undefined) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 365) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'window_days must be an integer between 1 and 365', req.requestId),
        );
      }
    }

    const windowDays = raw !== undefined ? Number(raw) : undefined;
    const report = await buildFunnelReport(pool, { window_days: windowDays });
    return reply.status(200).send(successEnvelope(report, req.requestId));
  });
}
