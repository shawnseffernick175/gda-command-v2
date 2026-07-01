/**
 * Capabilities routes (F-306).
 *
 * Endpoints:
 *   GET    /v3/capabilities                          — list all capabilities (filterable by ou, category)
 *   GET    /v3/capabilities/:id                      — get single capability
 *   POST   /v3/capabilities                          — create capability
 *   PATCH  /v3/capabilities/:id                      — update capability
 *   GET    /v3/opportunities/:id/capability-matches   — get matches for an opportunity
 *   POST   /v3/opportunities/:id/capability-matches   — compute/refresh matches
 *   POST   /v3/opportunities/:id/qualify              — check qualification (capability + doctrine gate)
 */

import type { FastifyInstance } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import {
  listCapabilities,
  getCapability,
  createCapability,
  updateCapability,
  getOpportunityCapabilityMatches,
  computeCapabilityMatches,
  checkQualification,
  type CapabilityCreateInput,
  type CapabilityUpdateInput,
} from '../services/capabilities/index.js';

const VALID_OUS = ['envision', 'riverstone', 'pd_systems'] as const;
const VALID_GRADES = ['A', 'B', 'C'] as const;

export async function capabilityRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/capabilities — list
  app.get('/v3/capabilities', async (req, reply) => {
    const query = req.query as { ou?: string; category?: string; include_inactive?: string };

    if (query.ou && !VALID_OUS.includes(query.ou as typeof VALID_OUS[number])) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid ou: ${query.ou}. Must be one of: ${VALID_OUS.join(', ')}`, req.requestId),
      );
    }

    const capabilities = await listCapabilities({
      ou: query.ou,
      active_only: query.include_inactive !== 'true',
      category: query.category,
    });

    return reply.send(successEnvelope(capabilities, req.requestId));
  });

  // GET /v3/capabilities/:id — detail
  app.get('/v3/capabilities/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const capability = await getCapability(id);

    if (!capability) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Capability ${id} not found`, req.requestId),
      );
    }

    return reply.send(successEnvelope(capability, req.requestId));
  });

  // POST /v3/capabilities — create
  app.post('/v3/capabilities', async (req, reply) => {
    const body = req.body as Partial<CapabilityCreateInput> | undefined;

    if (!body?.ou || !body?.name || !body?.category || !body?.description) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'ou, name, category, and description are required', req.requestId),
      );
    }

    if (!VALID_OUS.includes(body.ou as typeof VALID_OUS[number])) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid ou: ${body.ou}`, req.requestId),
      );
    }

    if (body.evidence_grade && !VALID_GRADES.includes(body.evidence_grade as typeof VALID_GRADES[number])) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid evidence_grade: ${body.evidence_grade}. Must be A, B, or C`, req.requestId),
      );
    }

    const capability = await createCapability(body as CapabilityCreateInput);
    return reply.status(201).send(successEnvelope(capability, req.requestId));
  });

  // PATCH /v3/capabilities/:id — update
  app.patch('/v3/capabilities/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as CapabilityUpdateInput | undefined;

    if (!body || Object.keys(body).length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body must contain at least one field to update', req.requestId),
      );
    }

    if (body.evidence_grade && !VALID_GRADES.includes(body.evidence_grade as typeof VALID_GRADES[number])) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid evidence_grade: ${body.evidence_grade}`, req.requestId),
      );
    }

    const updated = await updateCapability(id, body);
    if (!updated) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Capability ${id} not found`, req.requestId),
      );
    }

    return reply.send(successEnvelope(updated, req.requestId));
  });

  // GET /v3/opportunities/:id/capability-matches — read cached matches
  app.get('/v3/opportunities/:id/capability-matches', async (req, reply) => {
    const { id } = req.params as { id: string };

    const matches = await getOpportunityCapabilityMatches(id);
    return reply.send(successEnvelope(matches, req.requestId));
  });

  // POST /v3/opportunities/:id/capability-matches — compute fresh matches
  app.post('/v3/opportunities/:id/capability-matches', async (req, reply) => {
    const { id } = req.params as { id: string };

    try {
      const matches = await computeCapabilityMatches(id);
      return reply.send(successEnvelope(matches, req.requestId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to compute matches';
      if (message.includes('not found')) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', message, req.requestId));
      }
      throw err;
    }
  });

  // POST /v3/opportunities/:id/qualify — run qualification check
  app.post('/v3/opportunities/:id/qualify-check', async (req, reply) => {
    const { id } = req.params as { id: string };

    try {
      const result = await checkQualification(id);
      return reply.send(successEnvelope(result, req.requestId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Qualification check failed';
      if (message.includes('not found')) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', message, req.requestId));
      }
      throw err;
    }
  });
}
