/**
 * F-453 — Tunable Pwin scoring weights.
 *
 * Endpoints:
 *   GET  /v3/pwin/config       — current weights
 *   PUT  /v3/pwin/config       — replace weights
 *   POST /v3/pwin/config/reset — restore seed defaults
 */

import type { FastifyInstance } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { getPwinWeights, DEFAULT_PWIN_WEIGHTS, type PwinWeights } from '../services/pwin/pwin-weights.js';
import { pool } from '../lib/db.js';

export async function pwinConfigRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/pwin/config — return the current weights JSONB
  app.get('/v3/pwin/config', async (req, reply) => {
    const weights = await getPwinWeights();
    return reply.status(200).send(successEnvelope(weights, req.requestId));
  });

  // PUT /v3/pwin/config — replace weights with body
  app.put('/v3/pwin/config', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Body must be a JSON object with numeric values', req.requestId),
      );
    }

    // Validate all values are numbers
    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'number' || !isFinite(value)) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', `Weight "${key}" must be a finite number`, req.requestId),
        );
      }
    }

    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO pwin_scoring_config (config_key, weights, updated_at)
       VALUES ('default', $1, $2)
       ON CONFLICT (config_key)
       DO UPDATE SET weights = $1, updated_at = $2`,
      [JSON.stringify(body), now],
    );

    return reply.status(200).send(successEnvelope(body, req.requestId));
  });

  // POST /v3/pwin/config/reset — reset to seed defaults
  app.post('/v3/pwin/config/reset', async (req, reply) => {
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO pwin_scoring_config (config_key, weights, updated_at)
       VALUES ('default', $1, $2)
       ON CONFLICT (config_key)
       DO UPDATE SET weights = $1, updated_at = $2`,
      [JSON.stringify(DEFAULT_PWIN_WEIGHTS), now],
    );

    return reply.status(200).send(successEnvelope(DEFAULT_PWIN_WEIGHTS, req.requestId));
  });
}
