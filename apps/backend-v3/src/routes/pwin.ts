/**
 * PWin routes — F-302.
 *
 * Endpoints:
 *   POST   /v3/pwin/features     — compute + save feature snapshot
 *   POST   /v3/pwin/score        — score an opportunity
 *   GET    /v3/pwin/model        — active model info
 *   POST   /v3/pwin/retrain      — trigger retraining (admin)
 *   GET    /v3/pwin/models       — list all model versions
 *   POST   /v3/pwin/batch-score  — F-450 on-demand batch scoring (admin)
 */

import type { FastifyInstance } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import {
  saveFeatureSnapshot,
  scoreOpportunity,
  getModelInfo,
  trainIfReady,
  listModelVersions,
} from '../services/pwin/index.js';
import type { PwinFeatures } from '../services/pwin/types.js';
import { batchScoreOpportunities } from '../services/pwin/batch-score.js';

export async function pwinRoutes(app: FastifyInstance): Promise<void> {
  // POST /v3/pwin/features — compute + save feature snapshot
  app.post('/v3/pwin/features', async (req, reply) => {
    const body = req.body as { opportunity_id?: string; features?: PwinFeatures } | undefined;

    if (!body?.opportunity_id || !body?.features) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'opportunity_id and features are required', req.requestId),
      );
    }

    const snapshot = await saveFeatureSnapshot(body.opportunity_id, body.features);
    return reply.status(201).send(
      successEnvelope({ feature_snapshot_id: snapshot.id }, req.requestId),
    );
  });

  // POST /v3/pwin/score — score an opportunity
  app.post('/v3/pwin/score', async (req, reply) => {
    const body = req.body as { opportunity_id?: string; features?: PwinFeatures } | undefined;

    if (!body?.opportunity_id) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'opportunity_id is required', req.requestId),
      );
    }

    try {
      const result = await scoreOpportunity(body.opportunity_id, body.features);
      return reply.status(200).send(successEnvelope(result, req.requestId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scoring failed';
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', message, req.requestId),
      );
    }
  });

  // GET /v3/pwin/model — active model info
  app.get('/v3/pwin/model', async (req, reply) => {
    const info = await getModelInfo();
    if (!info) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'No active PWin model found', req.requestId),
      );
    }
    return reply.status(200).send(successEnvelope(info, req.requestId));
  });

  // POST /v3/pwin/retrain — trigger retraining
  app.post('/v3/pwin/retrain', async (req, reply) => {
    try {
      const result = await trainIfReady();
      if (!result) {
        return reply.status(200).send(
          successEnvelope({ message: 'No retraining needed — insufficient outcomes or already trained today' }, req.requestId),
        );
      }
      return reply.status(200).send(successEnvelope(result, req.requestId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Retraining failed';
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', message, req.requestId),
      );
    }
  });

  // GET /v3/pwin/models — list all model versions
  app.get('/v3/pwin/models', async (req, reply) => {
    const versions = await listModelVersions();
    return reply.status(200).send(successEnvelope(versions, req.requestId));
  });

  // POST /v3/pwin/batch-score — F-450 on-demand batch scoring
  app.post('/v3/pwin/batch-score', async (req, reply) => {
    const body = req.body as { ids?: unknown; limit?: unknown } | undefined;

    // Validate ids (optional array of numbers)
    let ids: number[] | undefined;
    if (body?.ids !== undefined) {
      if (!Array.isArray(body.ids) || !body.ids.every((v) => typeof v === 'number')) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'ids must be an array of numbers', req.requestId),
        );
      }
      ids = body.ids as number[];
    }

    // Validate limit (optional positive integer)
    let limit: number | undefined;
    if (body?.limit !== undefined) {
      if (typeof body.limit !== 'number' || !Number.isInteger(body.limit) || body.limit < 1) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'limit must be a positive integer', req.requestId),
        );
      }
      limit = body.limit;
    }

    const result = await batchScoreOpportunities({ ids, limit });
    return reply.status(200).send(successEnvelope(result, req.requestId));
  });
}
