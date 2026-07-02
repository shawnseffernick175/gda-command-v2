import type { FastifyInstance, FastifyRequest } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import {
  createActionItem,
  updateActionItem,
  listActionItems,
  getActionItem,
  getTopActionItems,
  getAssignee,
  toApiShape,
  approveDraft,
  rejectDraft,
  editDraft,
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
      doctrine_source?: string;
      priority?: string;
      linked_record_type?: string;
      limit?: string;
      cursor?: string;
      page?: string;
    };
  }>('/v3/action-items', async (req, reply) => {
    const filters: ActionItemListFilters = {
      status: req.query.status,
      owner: req.query.owner,
      source: req.query.source,
      doctrine_source: req.query.doctrine_source,
      priority: req.query.priority,
      linked_record_type: req.query.linked_record_type,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
      cursor: req.query.cursor,
      page: req.query.page ? parseInt(req.query.page, 10) : undefined,
    };

    const result = await listActionItems(filters);

    const itemsWithDrafts = await Promise.all(
      result.items.map(async (item) => {
        const [drafts, assignee] = await Promise.all([
          getDraftsByActionItem(item.id),
          getAssignee(item.assignee_id),
        ]);
        return toApiShape(item, drafts.map(toDraftApiShape), assignee);
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
            ...(result.page != null ? { page: result.page, totalPages: result.totalPages, total: result.total } : {}),
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

  app.get<{
    Querystring: { limit?: string };
  }>('/v3/action-items/top', async (req, reply) => {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 5;
    const items = await getTopActionItems(limit);

    const shaped = await Promise.all(
      items.map(async (item) => {
        const [drafts, assignee] = await Promise.all([
          getDraftsByActionItem(item.id),
          getAssignee(item.assignee_id),
        ]);
        return toApiShape(item, drafts.map(toDraftApiShape), assignee);
      })
    );

    return reply.status(200).send(successEnvelope(shaped, req.requestId));
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

  // F-310: Approve draft (does not send)
  app.post<{
    Params: { id: string };
  }>('/v3/action-items/:id/approve-draft', async (req, reply) => {
    try {
      const row = await approveDraft(req.params.id, getActor(req));
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

  // F-310: Reject draft with reason (captured for F-302 training)
  app.post<{
    Params: { id: string };
    Body: { reason: string };
  }>('/v3/action-items/:id/reject-draft', async (req, reply) => {
    const body = req.body as { reason?: string } | undefined;
    if (!body?.reason || body.reason.trim().length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'reason is required', req.requestId)
      );
    }

    try {
      const row = await rejectDraft(req.params.id, body.reason.trim(), getActor(req));
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

  // F-310: Edit draft — diff stored for F-302 voice training
  app.post<{
    Params: { id: string };
    Body: { edited_text: string };
  }>('/v3/action-items/:id/edit-draft', async (req, reply) => {
    const body = req.body as { edited_text?: string } | undefined;
    if (!body?.edited_text || body.edited_text.trim().length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'edited_text is required', req.requestId)
      );
    }

    try {
      const row = await editDraft(req.params.id, body.edited_text, getActor(req));
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
}
