import type { FastifyInstance, FastifyRequest } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import {
  createActionItem,
  updateActionItem,
  listActionItems,
  getActionItem,
  toApiShape,
  type ActionItemCreateInput,
  type ActionItemUpdateInput,
  type ActionItemListFilters,
} from '../services/action-items/index.js';
import {
  requestDraft,
  getDraftsByActionItem,
  isDraftKind,
  toDraftApiShape,
} from '../services/drafts/index.js';
import type { JwtPayload } from '../middleware/auth.js';

function getActor(req: FastifyRequest): string {
  const user = (req as FastifyRequest & { user?: JwtPayload }).user;
  return user?.sub ?? 'system';
}

export async function actionItemRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      status?: string;
      owner?: string;
      source?: string;
      linked_record_type?: string;
      limit?: string;
      cursor?: string;
    };
  }>('/v3/action-items', async (req, reply) => {
    const filters: ActionItemListFilters = {
      status: req.query.status,
      owner: req.query.owner,
      source: req.query.source,
      linked_record_type: req.query.linked_record_type,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
      cursor: req.query.cursor,
    };

    const result = await listActionItems(filters);

    const itemsWithDrafts = await Promise.all(
      result.items.map(async (item) => {
        const drafts = await getDraftsByActionItem(item.id);
        return toApiShape(item, drafts.map(toDraftApiShape));
      })
    );

    return reply.status(200).send(
      successEnvelope(
        {
          items: itemsWithDrafts,
          pagination: {
            limit: filters.limit,
            cursor: result.cursor,
            hasMore: result.hasMore,
          },
        },
        req.requestId
      )
    );
  });

  app.post<{
    Body: ActionItemCreateInput;
  }>('/v3/action-items', async (req, reply) => {
    const body = req.body as ActionItemCreateInput | undefined;
    if (!body) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body is required', req.requestId)
      );
    }

    try {
      const row = await createActionItem(body, getActor(req));
      const drafts = await getDraftsByActionItem(row.id);
      return reply.status(201).send(
        successEnvelope(toApiShape(row, drafts.map(toDraftApiShape)), req.requestId)
      );
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 400) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', e.message, req.requestId)
        );
      }
      throw err;
    }
  });

  app.patch<{
    Params: { id: string };
    Body: ActionItemUpdateInput & { force?: boolean };
  }>('/v3/action-items/:id', async (req, reply) => {
    const body = req.body as (ActionItemUpdateInput & { force?: boolean }) | undefined;
    if (!body) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body is required', req.requestId)
      );
    }

    try {
      const row = await updateActionItem(req.params.id, body, getActor(req));
      const drafts = await getDraftsByActionItem(row.id);
      return reply.status(200).send(
        successEnvelope(toApiShape(row, drafts.map(toDraftApiShape)), req.requestId)
      );
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 404) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', e.message, req.requestId)
        );
      }
      if (e.statusCode === 400) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', e.message, req.requestId)
        );
      }
      throw err;
    }
  });

  app.post<{
    Params: { id: string };
    Body: { kind: string };
  }>('/v3/action-items/:id/drafts', async (req, reply) => {
    const body = req.body as { kind?: string } | undefined;
    if (!body?.kind || !isDraftKind(body.kind)) {
      return reply.status(400).send(
        errorEnvelope(
          'VALIDATION_ERROR',
          'kind is required and must be one of: reply, research, milestone',
          req.requestId
        )
      );
    }

    const item = await getActionItem(req.params.id);
    if (!item) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Resource not found', req.requestId)
      );
    }

    const draft = await requestDraft(item, body.kind);
    return reply.status(201).send(
      successEnvelope(toDraftApiShape(draft), req.requestId)
    );
  });
}
