/**
 * Color Team Review routes — F-Color-Team-Reviews
 *
 * POST /v3/documents              — upload a document (stub for F-Universal-Ingestion)
 * GET  /v3/documents              — list documents
 * GET  /v3/documents/:id          — get document detail
 * POST /v3/color-teams/run        — kick off a color team run
 * GET  /v3/color-teams/runs/:id   — get run status + per-color counts
 * GET  /v3/color-teams/runs/:id/findings — findings list (optionally filter by color)
 * GET  /v3/color-teams/runs/:id/diff     — diff against a prior run
 * POST /v3/color-teams/findings/:id/to-action-item — push finding to action item tracker
 * GET  /v3/color-teams/documents/:docId/runs — list runs for a document
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import {
  isColorTeamEnabled,
  insertDocument,
  getDocument,
  listDocuments,
  createRun,
  getRun,
  listRunsForDocument,
  getFindings,
  getRunFindingCounts,
  diffRuns,
  getFindingById,
  linkFindingToActionItem,
  executeColorTeamRun,
  isValidColor,
} from '../services/color-teams/index.js';
import type { ColorTeamColor } from '../services/color-teams/types.js';

export async function colorTeamRoutes(app: FastifyInstance): Promise<void> {

  // ── Guard: feature flag ───────────────────────────────────────────────

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/v3/color-teams') && !req.url.startsWith('/v3/documents')) return;
    const enabled = await isColorTeamEnabled(pool);
    if (!enabled) {
      return reply.status(403).send(
        errorEnvelope('UNAUTHORIZED', 'Color Team Reviews feature is not enabled', req.requestId)
      );
    }
  });

  // ── Documents ─────────────────────────────────────────────────────────

  app.post<{
    Body: {
      filename: string;
      mime_type?: string;
      file_size_bytes?: number;
      doc_type?: string;
      storage_path: string;
      opportunity_id?: string;
    };
  }>('/v3/documents', async (req, reply) => {
    const user = (req as unknown as { user?: { sub: string } }).user;
    if (!user) return reply.status(401).send(errorEnvelope('UNAUTHORIZED', 'Authentication required', req.requestId));

    const { filename, mime_type, file_size_bytes, doc_type, storage_path, opportunity_id } = req.body;
    if (!filename || !storage_path) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'filename and storage_path are required', req.requestId)
      );
    }

    const doc = await insertDocument(pool, {
      filename,
      mime_type: mime_type ?? 'application/pdf',
      file_size_bytes: file_size_bytes ?? null,
      doc_type: doc_type ?? 'unknown',
      storage_path,
      uploaded_by: user.sub,
      opportunity_id: opportunity_id ?? null,
    });

    return reply.status(201).send(successEnvelope(doc, req.requestId));
  });

  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>('/v3/documents', async (req, reply) => {
    const user = (req as unknown as { user?: { sub: string } }).user;
    if (!user) return reply.status(401).send(errorEnvelope('UNAUTHORIZED', 'Authentication required', req.requestId));

    const limit = parseInt(req.query.limit ?? '50', 10);
    const offset = parseInt(req.query.offset ?? '0', 10);

    const result = await listDocuments(pool, { limit, offset });
    return reply.send(successEnvelope(result, req.requestId));
  });

  app.get<{
    Params: { id: string };
  }>('/v3/documents/:id', async (req, reply) => {
    const doc = await getDocument(pool, req.params.id);
    if (!doc) return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Document not found', req.requestId));
    return reply.send(successEnvelope(doc, req.requestId));
  });

  // ── Runs ──────────────────────────────────────────────────────────────

  app.post<{
    Body: {
      document_id: string;
      colors: string[];
      linked_rfp_id?: string;
    };
  }>('/v3/color-teams/run', async (req, reply) => {
    const user = (req as unknown as { user?: { sub: string } }).user;
    if (!user) return reply.status(401).send(errorEnvelope('UNAUTHORIZED', 'Authentication required', req.requestId));

    const { document_id, colors, linked_rfp_id } = req.body;

    if (!document_id || !colors || !Array.isArray(colors) || colors.length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'document_id and non-empty colors[] are required', req.requestId)
      );
    }

    // Reject Gold explicitly
    if (colors.some((c) => c.toLowerCase() === 'gold')) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Gold not supported; use Green', req.requestId)
      );
    }

    const invalidColors = colors.filter((c) => !isValidColor(c));
    if (invalidColors.length > 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid colors: ${invalidColors.join(', ')}`, req.requestId)
      );
    }

    const doc = await getDocument(pool, document_id);
    if (!doc) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Document not found', req.requestId)
      );
    }

    const run = await createRun(pool, {
      document_id,
      colors: colors as ColorTeamColor[],
      triggered_by: user.sub,
      linked_rfp_id: linked_rfp_id ?? null,
    });

    // Fire-and-forget: execute the run asynchronously (stub pre-F-300)
    executeColorTeamRun(pool, String(run.id)).catch((err) => {
      logger.error({ err, runId: run.id }, 'Background color team run failed');
    });

    return reply.status(201).send(
      successEnvelope({ run_id: run.id, status: run.status }, req.requestId)
    );
  });

  app.get<{
    Params: { id: string };
  }>('/v3/color-teams/runs/:id', async (req, reply) => {
    const run = await getRun(pool, req.params.id);
    if (!run) return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Run not found', req.requestId));

    const counts = await getRunFindingCounts(pool, req.params.id);

    return reply.send(successEnvelope({
      ...run,
      finding_counts: counts,
    }, req.requestId));
  });

  app.get<{
    Params: { id: string };
    Querystring: { color?: string };
  }>('/v3/color-teams/runs/:id/findings', async (req, reply) => {
    const run = await getRun(pool, req.params.id);
    if (!run) return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Run not found', req.requestId));

    const color = req.query.color;
    if (color && !isValidColor(color)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid color: ${color}`, req.requestId)
      );
    }

    const findings = await getFindings(pool, req.params.id, color);
    return reply.send(successEnvelope({ findings, total: findings.length }, req.requestId));
  });

  app.get<{
    Params: { id: string };
    Querystring: { against: string };
  }>('/v3/color-teams/runs/:id/diff', async (req, reply) => {
    const { against } = req.query;
    if (!against) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'against query parameter is required', req.requestId)
      );
    }

    const currentRun = await getRun(pool, req.params.id);
    const priorRun = await getRun(pool, against);
    if (!currentRun) return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Current run not found', req.requestId));
    if (!priorRun) return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Prior run not found', req.requestId));

    const diff = await diffRuns(pool, req.params.id, against);
    return reply.send(successEnvelope(diff, req.requestId));
  });

  // ── Findings → Action Items ───────────────────────────────────────────

  app.post<{
    Params: { id: string };
  }>('/v3/color-teams/findings/:id/to-action-item', async (req, reply) => {
    const user = (req as unknown as { user?: { sub: string } }).user;
    if (!user) return reply.status(401).send(errorEnvelope('UNAUTHORIZED', 'Authentication required', req.requestId));

    const finding = await getFindingById(pool, req.params.id);
    if (!finding) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Finding not found', req.requestId));
    }

    if (finding.action_item_id) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Finding already linked to an action item', req.requestId)
      );
    }

    // Create source for the action item
    const sourceRes = await pool.query<{ id: string }>(
      `INSERT INTO sources (kind, title, retrieved_at) VALUES ('color_team', $1, NOW()) RETURNING id`,
      [`Color Team ${finding.color} finding`]
    );
    const sourceId = sourceRes.rows[0]!.id;

    // Create action item from finding
    const aiRes = await pool.query<{ id: string }>(
      `INSERT INTO action_items (title, body, owner_email, status, priority, source_id)
       VALUES ($1, $2, $3, 'open', $4, $5) RETURNING id`,
      [
        `[${finding.color.toUpperCase()}] ${finding.finding.slice(0, 120)}`,
        `${finding.finding}\n\nRecommended fix: ${finding.recommended_fix ?? 'N/A'}\n\nSection: ${finding.section_ref ?? 'N/A'}`,
        user.sub,
        finding.severity === 'blocker' || finding.severity === 'critical' ? 'high' : 'medium',
        sourceId,
      ]
    );

    await linkFindingToActionItem(pool, req.params.id, aiRes.rows[0]!.id);

    return reply.status(201).send(
      successEnvelope({ action_item_id: aiRes.rows[0]!.id, finding_id: req.params.id }, req.requestId)
    );
  });

  // ── Document runs listing ─────────────────────────────────────────────

  app.get<{
    Params: { docId: string };
  }>('/v3/color-teams/documents/:docId/runs', async (req, reply) => {
    const runs = await listRunsForDocument(pool, req.params.docId);
    return reply.send(successEnvelope({ runs, total: runs.length }, req.requestId));
  });
}
