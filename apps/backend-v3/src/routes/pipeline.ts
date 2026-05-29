import type { FastifyInstance } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import {
  listPipelineItems,
  createPipelineItem,
  updatePipelineItem,
} from '../services/pipeline/index.js';
import type { JwtPayload } from '../middleware/auth.js';
import type { Milestone } from '../services/pipeline/types.js';

interface ListQuery {
  limit?: string;
  cursor?: string;
  capture_owner?: string;
  opportunity_agency?: string;
  opportunity_naics?: string;
  opportunity_set_aside?: string;
  due_after?: string;
  due_before?: string;
}

interface CreateBody {
  opportunity_id: string;
  capture_owner: string;
  milestones?: Milestone[];
  win_prob_pct?: number;
  win_prob_evidence?: string;
  teaming_partners?: string[];
}

interface UpdateBody {
  capture_owner?: string;
  milestones?: Milestone[];
  win_prob_pct?: number;
  win_prob_evidence?: string;
  teaming_partners?: string[];
}

export async function pipelineRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ListQuery }>('/v3/pipeline', async (req, reply) => {
    const rawLimit = parseInt(req.query.limit ?? '50', 10);
    const limit = Number.isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 200);

    const result = await listPipelineItems({
      limit,
      cursor: req.query.cursor,
      capture_owner: req.query.capture_owner,
      opportunity_agency: req.query.opportunity_agency,
      opportunity_naics: req.query.opportunity_naics,
      opportunity_set_aside: req.query.opportunity_set_aside,
      due_after: req.query.due_after,
      due_before: req.query.due_before,
    });

    return reply.status(200).send(successEnvelope(result, req.requestId));
  });

  app.post<{ Body: CreateBody }>('/v3/pipeline', async (req, reply) => {
    const body = req.body as CreateBody | undefined;
    if (!body || !body.opportunity_id || !body.capture_owner) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'opportunity_id and capture_owner are required', req.requestId),
      );
    }

    if (body.win_prob_pct !== undefined && body.win_prob_pct !== null) {
      if (body.win_prob_pct < 0 || body.win_prob_pct > 100) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'win_prob_pct must be between 0 and 100', req.requestId),
        );
      }
      if (!body.win_prob_evidence) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'win_prob_evidence is required when win_prob_pct is provided', req.requestId),
        );
      }
    }

    const user = (req as typeof req & { user?: JwtPayload }).user;
    const userId = user?.sub ?? 'unknown';

    try {
      const { item, created } = await createPipelineItem(
        {
          opportunity_id: body.opportunity_id,
          capture_owner: body.capture_owner,
          milestones: body.milestones,
          win_prob_pct: body.win_prob_pct,
          win_prob_evidence: body.win_prob_evidence,
          teaming_partners: body.teaming_partners,
        },
        userId,
      );

      const status = created ? 201 : 409;
      return reply.status(status).send(successEnvelope(item, req.requestId));
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 404) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', e.message, req.requestId),
        );
      }
      if (e.statusCode === 400) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', e.message, req.requestId),
        );
      }
      throw err;
    }
  });

  app.patch<{ Params: { id: string }; Body: UpdateBody }>('/v3/pipeline/:id', async (req, reply) => {
    const { id } = req.params;
    const body = req.body as UpdateBody | undefined;

    if (!body || Object.keys(body).length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body must contain at least one field to update', req.requestId),
      );
    }

    if (body.win_prob_pct !== undefined && body.win_prob_pct !== null) {
      if (body.win_prob_pct < 0 || body.win_prob_pct > 100) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'win_prob_pct must be between 0 and 100', req.requestId),
        );
      }
      if (!body.win_prob_evidence) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'win_prob_evidence is required when win_prob_pct is provided', req.requestId),
        );
      }
    }

    const item = await updatePipelineItem(id, {
      capture_owner: body.capture_owner,
      milestones: body.milestones,
      win_prob_pct: body.win_prob_pct,
      win_prob_evidence: body.win_prob_evidence,
      teaming_partners: body.teaming_partners,
    });

    if (!item) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Pipeline item not found', req.requestId),
      );
    }

    return reply.status(200).send(successEnvelope(item, req.requestId));
  });
}
