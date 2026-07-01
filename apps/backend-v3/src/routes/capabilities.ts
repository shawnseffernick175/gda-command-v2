/**
 * Capability catalog routes (F-306).
 *
 * Endpoints:
 *   GET    /v3/capabilities              — list capabilities (filterable by ou, active, category)
 *   POST   /v3/capabilities              — create a new capability
 *   GET    /v3/capabilities/:id          — get a single capability
 *   PATCH  /v3/capabilities/:id          — update a capability
 *   POST   /v3/capabilities/seed         — seed the Envision catalog (idempotent)
 *   GET    /v3/opportunities/:id/capability-matches — capability matches for an opportunity
 *   POST   /v3/opportunities/:id/capability-matches/compute — recompute matches
 *   POST   /v3/opportunities/:id/qualify-check — check qualification eligibility
 */

import type { FastifyInstance } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import {
  listCapabilities,
  getCapabilityById,
  createCapability,
  updateCapability,
  getOpportunityCapabilityMatches,
  matchOpportunityCapabilities,
  qualifyWithCapabilities,
} from '../services/capabilities/index.js';
import { seedCapabilities } from '../services/capabilities/seed.js';
import type { OU, CapabilityCreateInput, CapabilityUpdateInput } from '../services/capabilities/types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_OUS = ['envision', 'riverstone', 'pd_systems'];

export async function capabilityRoutes(app: FastifyInstance): Promise<void> {

  // GET /v3/capabilities — list
  app.get('/v3/capabilities', async (req, reply) => {
    const query = req.query as { ou?: string; active?: string; category?: string };
    const filters: { ou?: OU; active?: boolean; category?: string } = {};

    if (query.ou) {
      if (!VALID_OUS.includes(query.ou)) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', `Invalid ou: ${query.ou}`, req.requestId),
        );
      }
      filters.ou = query.ou as OU;
    }
    if (query.active !== undefined) {
      filters.active = query.active === 'true';
    }
    if (query.category) {
      filters.category = query.category;
    }

    const capabilities = await listCapabilities(filters);
    return reply.send(successEnvelope(capabilities, req.requestId));
  });

  // POST /v3/capabilities — create
  app.post('/v3/capabilities', async (req, reply) => {
    const body = req.body as CapabilityCreateInput | undefined;
    if (!body?.ou || !body?.name || !body?.category || !body?.description) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'ou, name, category, and description are required', req.requestId),
      );
    }
    if (!VALID_OUS.includes(body.ou)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid ou: ${body.ou}`, req.requestId),
      );
    }

    try {
      const capability = await createCapability(body);
      return reply.status(201).send(successEnvelope(capability, req.requestId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create capability';
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', message, req.requestId));
    }
  });

  // GET /v3/capabilities/:id — detail
  app.get<{ Params: { id: string } }>('/v3/capabilities/:id', async (req, reply) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid UUID format', req.requestId));
    }

    const capability = await getCapabilityById(id);
    if (!capability) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Capability not found', req.requestId));
    }
    return reply.send(successEnvelope(capability, req.requestId));
  });

  // PATCH /v3/capabilities/:id — update
  app.patch<{ Params: { id: string } }>('/v3/capabilities/:id', async (req, reply) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid UUID format', req.requestId));
    }

    const body = req.body as CapabilityUpdateInput | undefined;
    if (!body || Object.keys(body).length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body must contain at least one field to update', req.requestId),
      );
    }

    try {
      const updated = await updateCapability(id, body);
      if (!updated) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Capability not found', req.requestId));
      }
      return reply.send(successEnvelope(updated, req.requestId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', message, req.requestId));
    }
  });

  // POST /v3/capabilities/seed — idempotent seed
  app.post('/v3/capabilities/seed', async (req, reply) => {
    const result = await seedCapabilities();
    return reply.send(successEnvelope(result, req.requestId));
  });

  // GET /v3/opportunities/:id/capability-matches — get matches
  app.get<{ Params: { id: string } }>('/v3/opportunities/:id/capability-matches', async (req, reply) => {
    const { id } = req.params;
    try {
      const matches = await getOpportunityCapabilityMatches(id);
      return reply.send(successEnvelope(matches, req.requestId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get matches';
      if (message.includes('not found')) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', message, req.requestId));
      }
      throw err;
    }
  });

  // POST /v3/opportunities/:id/capability-matches/compute — recompute matches
  app.post<{ Params: { id: string } }>('/v3/opportunities/:id/capability-matches/compute', async (req, reply) => {
    const { id } = req.params;
    try {
      const matches = await matchOpportunityCapabilities(id);
      return reply.send(successEnvelope(matches, req.requestId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to compute matches';
      if (message.includes('not found')) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', message, req.requestId));
      }
      throw err;
    }
  });

  // POST /v3/opportunities/:id/qualify-check — check qualification eligibility
  app.post<{ Params: { id: string } }>('/v3/opportunities/:id/qualify-check', async (req, reply) => {
    const { id } = req.params;
    try {
      const result = await qualifyWithCapabilities(id);
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
