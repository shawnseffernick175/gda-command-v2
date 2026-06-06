/**
 * Doctrine Rules Engine routes (F-303).
 *
 * Endpoints:
 *   POST   /v3/doctrine/check              — run doctrine evaluation on an entity
 *   GET    /v3/doctrine/evaluations         — history of evaluations for an entity
 *   GET    /v3/doctrine/principles          — list all 8 principles
 *   GET    /v3/doctrine/exclusions          — list all 6 exclusions
 *   GET    /v3/doctrine/config              — current rules config
 *   PATCH  /v3/doctrine/config/:key         — update a config key (admin only)
 */

import type { FastifyInstance } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { pool } from '../lib/db.js';
import {
  getPrinciples,
  getExclusions,
  getConfig,
  updateConfig,
  updatePrincipleEvaluationPrompt,
  runDoctrineCheck,
  getEvaluationHistory,
} from '../services/doctrine/index.js';

export async function doctrineRoutes(app: FastifyInstance): Promise<void> {
  // POST /v3/doctrine/check — run a full doctrine evaluation
  app.post('/v3/doctrine/check', async (req, reply) => {
    const body = req.body as { entity_kind?: string; entity_id?: string; context?: Record<string, unknown> } | undefined;

    if (!body?.entity_kind || !body?.entity_id) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'entity_kind and entity_id are required', req.requestId)
      );
    }

    const { entity_kind, entity_id, context } = body;

    try {
      const evaluation = await runDoctrineCheck(entity_kind, entity_id, context);
      return reply.send(successEnvelope(evaluation, req.requestId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Doctrine check failed';
      if (message.includes('not found')) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', message, req.requestId));
      }
      throw err;
    }
  });

  // GET /v3/doctrine/evaluations — evaluation history for an entity
  app.get('/v3/doctrine/evaluations', async (req, reply) => {
    const query = req.query as { entity_kind?: string; entity_id?: string };

    if (!query.entity_kind || !query.entity_id) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'entity_kind and entity_id query params are required', req.requestId)
      );
    }

    const evaluations = await getEvaluationHistory(query.entity_kind, query.entity_id);
    return reply.send(successEnvelope(evaluations, req.requestId));
  });

  // GET /v3/doctrine/principles — list all 8 doctrine principles
  app.get('/v3/doctrine/principles', async (req, reply) => {
    const principles = await getPrinciples();
    return reply.send(successEnvelope(principles, req.requestId));
  });

  // PATCH /v3/doctrine/principles/:id — update evaluation_prompt
  app.patch('/v3/doctrine/principles/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { evaluation_prompt?: string } | undefined;

    if (typeof body?.evaluation_prompt !== 'string') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'evaluation_prompt string is required in body', req.requestId)
      );
    }

    const updated = await updatePrincipleEvaluationPrompt(id, body.evaluation_prompt);
    if (!updated) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Principle "${id}" not found`, req.requestId)
      );
    }

    return reply.send(successEnvelope(updated, req.requestId));
  });

  // GET /v3/doctrine/exclusions — list all 6 strategic exclusions
  app.get('/v3/doctrine/exclusions', async (req, reply) => {
    const exclusions = await getExclusions();
    return reply.send(successEnvelope(exclusions, req.requestId));
  });

  // GET /v3/doctrine/config — current rules config
  app.get('/v3/doctrine/config', async (req, reply) => {
    const configRows = await getConfig();
    return reply.send(successEnvelope(configRows, req.requestId));
  });

  // PATCH /v3/doctrine/config/:key — update a config value (admin only)
  app.patch('/v3/doctrine/config/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const body = req.body as { value?: unknown } | undefined;

    if (body?.value === undefined) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'value is required in body', req.requestId)
      );
    }

    // Admin check — in production, enforce via authHook role
    const user = (req as typeof req & { user?: { role?: string } }).user;
    if (user?.role !== 'admin') {
      return reply.status(403).send(
        errorEnvelope('UNAUTHORIZED', 'Only admins can update doctrine config', req.requestId)
      );
    }

    const updated = await updateConfig(key, body.value);
    if (!updated) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Config key "${key}" not found`, req.requestId)
      );
    }

    return reply.send(successEnvelope(updated, req.requestId));
  });

  // POST /v3/doctrine/override — record an exclusion/margin override with rationale
  app.post('/v3/doctrine/override', async (req, reply) => {
    const body = req.body as {
      entity_kind?: string;
      entity_id?: string;
      kind?: string;
      rationale?: string;
      exclusion_ids?: string[];
    } | undefined;

    if (!body?.entity_kind || !body?.entity_id || !body?.rationale || !body?.kind) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'entity_kind, entity_id, kind, and rationale are required', req.requestId)
      );
    }

    if (body.rationale.trim().length < 50) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Rationale must be at least 50 characters', req.requestId)
      );
    }

    const user = (req as typeof req & { user?: { sub?: string } }).user;

    const insertRes = await pool.query(
      `INSERT INTO agent_decisions (id, opportunity_id, kind, rationale, evidence_refs, decided_by, decided_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())
       RETURNING id, decided_at`,
      [
        body.entity_id,
        body.kind,
        body.rationale.trim(),
        JSON.stringify(body.exclusion_ids ?? []),
        user?.sub ?? 'unknown',
      ]
    );

    return reply.send(successEnvelope(insertRes.rows[0], req.requestId));
  });
}
