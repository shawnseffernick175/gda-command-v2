/**
 * F-313: Output Generators routes
 *
 * POST /v3/output-generators/briefing      — generate opportunity briefing
 * POST /v3/output-generators/capture-plan  — generate capture plan
 * POST /v3/output-generators/win-themes    — generate win themes
 * GET  /v3/output-generators/:id           — get generated document
 * GET  /v3/output-generators/:id/html      — get HTML content for preview
 * GET  /v3/output-generators               — list generated documents
 */

import type { FastifyInstance } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import {
  generateBriefing,
  generateCapturePlan,
  generateWinThemesPdf,
  getGeneratedDoc,
  listGeneratedDocs,
} from '../services/output-generators/index.js';

export async function outputGeneratorRoutes(app: FastifyInstance): Promise<void> {
  // POST /v3/output-generators/briefing
  app.post<{
    Body: { opportunity_id: string };
  }>('/v3/output-generators/briefing', async (req, reply) => {
    const user = (req as unknown as { user?: { sub: string } }).user;
    if (!user) {
      return reply.status(401).send(
        errorEnvelope('UNAUTHORIZED', 'Authentication required', req.requestId),
      );
    }

    const body = req.body as Record<string, unknown> | undefined;
    const opportunityId = body?.opportunity_id;

    if (!opportunityId || typeof opportunityId !== 'string') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'opportunity_id is required', req.requestId),
      );
    }

    try {
      const doc = await generateBriefing(String(opportunityId), user.sub);
      return reply.status(201).send(
        successEnvelope(
          {
            id: doc.id,
            doc_type: doc.doc_type,
            title: doc.title,
            opportunity_id: doc.opportunity_id,
            citations: doc.citations,
            doctrine_refs: doc.doctrine_refs,
            created_at: doc.created_at,
          },
          req.requestId,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      logger.error({ err, opportunityId }, 'Briefing generation failed');
      if (message.includes('not found')) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', message, req.requestId));
      }
      return reply.status(500).send(errorEnvelope('INTERNAL_ERROR', message, req.requestId));
    }
  });

  // POST /v3/output-generators/capture-plan
  app.post<{
    Body: { capture_id: string };
  }>('/v3/output-generators/capture-plan', async (req, reply) => {
    const user = (req as unknown as { user?: { sub: string } }).user;
    if (!user) {
      return reply.status(401).send(
        errorEnvelope('UNAUTHORIZED', 'Authentication required', req.requestId),
      );
    }

    const body = req.body as Record<string, unknown> | undefined;
    const captureId = body?.capture_id;

    if (!captureId || typeof captureId !== 'string') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'capture_id is required', req.requestId),
      );
    }

    try {
      const doc = await generateCapturePlan(String(captureId), user.sub);
      return reply.status(201).send(
        successEnvelope(
          {
            id: doc.id,
            doc_type: doc.doc_type,
            title: doc.title,
            capture_id: doc.capture_id,
            opportunity_id: doc.opportunity_id,
            citations: doc.citations,
            doctrine_refs: doc.doctrine_refs,
            created_at: doc.created_at,
          },
          req.requestId,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      logger.error({ err, captureId }, 'Capture plan generation failed');
      if (message.includes('not found')) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', message, req.requestId));
      }
      return reply.status(500).send(errorEnvelope('INTERNAL_ERROR', message, req.requestId));
    }
  });

  // POST /v3/output-generators/win-themes
  app.post<{
    Body: { capture_id: string };
  }>('/v3/output-generators/win-themes', async (req, reply) => {
    const user = (req as unknown as { user?: { sub: string } }).user;
    if (!user) {
      return reply.status(401).send(
        errorEnvelope('UNAUTHORIZED', 'Authentication required', req.requestId),
      );
    }

    const body = req.body as Record<string, unknown> | undefined;
    const captureId = body?.capture_id;

    if (!captureId || typeof captureId !== 'string') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'capture_id is required', req.requestId),
      );
    }

    try {
      const doc = await generateWinThemesPdf(String(captureId), user.sub);
      return reply.status(201).send(
        successEnvelope(
          {
            id: doc.id,
            doc_type: doc.doc_type,
            title: doc.title,
            capture_id: doc.capture_id,
            opportunity_id: doc.opportunity_id,
            citations: doc.citations,
            doctrine_refs: doc.doctrine_refs,
            created_at: doc.created_at,
          },
          req.requestId,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      logger.error({ err, captureId }, 'Win themes generation failed');
      if (message.includes('not found')) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', message, req.requestId));
      }
      return reply.status(500).send(errorEnvelope('INTERNAL_ERROR', message, req.requestId));
    }
  });

  // GET /v3/output-generators/:id
  app.get<{
    Params: { id: string };
  }>('/v3/output-generators/:id', async (req, reply) => {
    const doc = await getGeneratedDoc(req.params.id);
    if (!doc) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Generated document not found', req.requestId),
      );
    }
    return reply.send(
      successEnvelope(
        {
          id: doc.id,
          doc_type: doc.doc_type,
          title: doc.title,
          opportunity_id: doc.opportunity_id,
          capture_id: doc.capture_id,
          citations: doc.citations,
          doctrine_refs: doc.doctrine_refs,
          metadata: doc.metadata,
          created_by: doc.created_by,
          created_at: doc.created_at,
          updated_at: doc.updated_at,
        },
        req.requestId,
      ),
    );
  });

  // GET /v3/output-generators/:id/html — returns raw HTML for preview or PDF conversion
  app.get<{
    Params: { id: string };
  }>('/v3/output-generators/:id/html', async (req, reply) => {
    const doc = await getGeneratedDoc(req.params.id);
    if (!doc) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Generated document not found', req.requestId),
      );
    }
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Content-Disposition', `inline; filename="${doc.title.replace(/[^a-zA-Z0-9\s-]/g, '')}.html"`)
      .send(doc.html_content);
  });

  // GET /v3/output-generators — list generated documents
  app.get<{
    Querystring: {
      opportunity_id?: string;
      capture_id?: string;
      doc_type?: string;
      limit?: string;
      offset?: string;
    };
  }>('/v3/output-generators', async (req, reply) => {
    const VALID_DOC_TYPES = ['briefing', 'capture_plan', 'win_themes'];
    const docType = req.query.doc_type;
    if (docType && !VALID_DOC_TYPES.includes(docType)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid doc_type: must be one of ${VALID_DOC_TYPES.join(', ')}`, req.requestId),
      );
    }

    const result = await listGeneratedDocs({
      opportunity_id: req.query.opportunity_id,
      capture_id: req.query.capture_id,
      doc_type: docType,
      limit: parseInt(req.query.limit ?? '50', 10),
      offset: parseInt(req.query.offset ?? '0', 10),
    });
    return reply.send(
      successEnvelope(
        {
          items: result.items.map((doc) => ({
            id: doc.id,
            doc_type: doc.doc_type,
            title: doc.title,
            opportunity_id: doc.opportunity_id,
            capture_id: doc.capture_id,
            created_by: doc.created_by,
            created_at: doc.created_at,
          })),
          total: result.total,
        },
        req.requestId,
      ),
    );
  });
}
