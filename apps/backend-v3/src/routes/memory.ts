/**
 * Decision Memory routes — F-302.
 *
 * Endpoints:
 *   POST   /v3/memory/decisions                — create a decision
 *   GET    /v3/memory/decisions                 — list decisions with filters
 *   GET    /v3/memory/decisions/:id             — get a single decision
 *   PATCH  /v3/memory/decisions/:id/outcome     — record outcome (immutable after first set)
 *   GET    /v3/memory/decisions/recent           — last 7 days summary
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import {
  createDecision,
  listDecisions,
  getDecisionById,
  recordOutcome,
  getRecentDecisionsSummary,
  validateDecisionInput,
} from '../services/memory/index.js';
import type {
  DecisionCreateInput,
  DecisionOutcomeInput,
  DecisionListFilters,
  DecisionKind,
  EntityKind,
} from '../services/memory/types.js';

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  // POST /v3/memory/decisions — create decision
  app.post('/v3/memory/decisions', async (req, reply) => {
    const body = req.body as DecisionCreateInput | undefined;
    if (!body) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body is required', req.requestId),
      );
    }

    const validationError = validateDecisionInput(body);
    if (validationError) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', validationError, req.requestId),
      );
    }

    const decision = await createDecision(body);
    return reply.status(201).send(successEnvelope({ decision_id: decision.id }, req.requestId));
  });

  // GET /v3/memory/decisions — list with filters
  app.get('/v3/memory/decisions', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const filters: DecisionListFilters = {
      entity_kind: query.entity_kind as EntityKind | undefined,
      entity_id: query.entity_id,
      kind: query.kind as DecisionKind | undefined,
      since: query.since,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    };

    const decisions = await listDecisions(filters);
    return reply.status(200).send(successEnvelope(decisions, req.requestId));
  });

  // GET /v3/memory/decisions/recent — last 7 days
  app.get('/v3/memory/decisions/recent', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const days = query.days ? parseInt(query.days, 10) : 7;
    const limit = query.limit ? parseInt(query.limit, 10) : 10;

    const decisions = await getRecentDecisionsSummary(days, limit);
    return reply.status(200).send(successEnvelope(decisions, req.requestId));
  });

  // GET /v3/memory/decisions/:id — single decision
  app.get('/v3/memory/decisions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const decision = await getDecisionById(id);
    if (!decision) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Decision ${id} not found`, req.requestId),
      );
    }
    return reply.status(200).send(successEnvelope(decision, req.requestId));
  });

  // PATCH /v3/memory/decisions/:id/outcome — record outcome
  app.patch('/v3/memory/decisions/:id/outcome', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as DecisionOutcomeInput | undefined;

    if (!body || !body.outcome) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'outcome is required', req.requestId),
      );
    }

    const VALID_OUTCOMES = new Set(['won', 'lost', 'withdrawn', 'no_award']);
    if (!VALID_OUTCOMES.has(body.outcome)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid outcome value '${body.outcome}'. Must be one of: won, lost, withdrawn, no_award`, req.requestId),
      );
    }

    const updated = await recordOutcome(id, body);
    if (!updated) {
      const existing = await getDecisionById(id);
      if (!existing) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', `Decision ${id} not found`, req.requestId),
        );
      }
      return reply.status(409).send(
        errorEnvelope('VALIDATION_ERROR', 'Outcome already recorded — decisions are immutable once outcome is set', req.requestId),
      );
    }

    return reply.status(200).send(successEnvelope(updated, req.requestId));
  });
}
