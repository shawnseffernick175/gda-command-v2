/**
 * Output Generators routes — F-313
 *
 * Endpoints:
 *   POST /v3/output-generators/briefing      — generate Opportunity Briefing PDF
 *   POST /v3/output-generators/capture-plan   — generate Capture Plan PDF
 *   POST /v3/output-generators/win-themes     — generate Win Themes PDF
 *   GET  /v3/output-generators/:id/download   — download a generated PDF
 *   GET  /v3/output-generators/list           — list generated documents
 *
 * Hard rules:
 *   - 6 colors only (pink/red/black/blue/white/green)
 *   - R1: every claim cited
 *   - R2: auto-populate from cached analysis (no re-running)
 */

import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import {
  generateBriefing,
  generateCapturePlan,
  generateWinThemes,
} from '../services/output-generators/index.js';

interface GeneratedDocListRow {
  id: string;
  doc_kind: string;
  opportunity_id: string | null;
  capture_id: string | null;
  vault_doc_id: number | null;
  file_path: string;
  file_size_bytes: number | null;
  created_at: string;
  opportunity_title: string | null;
}

export async function outputGeneratorRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /v3/output-generators/briefing
   * Body: { opportunity_id: string }
   * Returns: generated doc metadata + vault doc id
   */
  app.post<{
    Body: { opportunity_id: string };
  }>('/v3/output-generators/briefing', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;
    const opportunityId = body?.opportunity_id;

    if (!opportunityId || typeof opportunityId !== 'string') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'opportunity_id is required', req.requestId),
      );
    }

    try {
      const doc = await generateBriefing(pool, opportunityId);
      return reply.status(201).send(
        successEnvelope({
          id: doc.id,
          doc_kind: doc.docKind,
          file_size_bytes: doc.fileSizeBytes,
          vault_doc_id: doc.vaultDocId,
          download_url: `/v3/output-generators/${doc.id}/download`,
        }, req.requestId),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      logger.error({ err, opportunityId }, 'Briefing generation failed');
      if (message.includes('not found')) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', message, req.requestId),
        );
      }
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', message, req.requestId),
      );
    }
  });

  /**
   * POST /v3/output-generators/capture-plan
   * Body: { capture_id: string }
   */
  app.post<{
    Body: { capture_id: string };
  }>('/v3/output-generators/capture-plan', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;
    const captureId = body?.capture_id;

    if (!captureId || typeof captureId !== 'string') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'capture_id is required', req.requestId),
      );
    }

    try {
      const doc = await generateCapturePlan(pool, captureId);
      return reply.status(201).send(
        successEnvelope({
          id: doc.id,
          doc_kind: doc.docKind,
          file_size_bytes: doc.fileSizeBytes,
          vault_doc_id: doc.vaultDocId,
          download_url: `/v3/output-generators/${doc.id}/download`,
        }, req.requestId),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      logger.error({ err, captureId }, 'Capture plan generation failed');
      if (message.includes('not found')) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', message, req.requestId),
        );
      }
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', message, req.requestId),
      );
    }
  });

  /**
   * POST /v3/output-generators/win-themes
   * Body: { capture_id: string }
   */
  app.post<{
    Body: { capture_id: string };
  }>('/v3/output-generators/win-themes', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;
    const captureId = body?.capture_id;

    if (!captureId || typeof captureId !== 'string') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'capture_id is required', req.requestId),
      );
    }

    try {
      const doc = await generateWinThemes(pool, captureId);
      return reply.status(201).send(
        successEnvelope({
          id: doc.id,
          doc_kind: doc.docKind,
          file_size_bytes: doc.fileSizeBytes,
          vault_doc_id: doc.vaultDocId,
          download_url: `/v3/output-generators/${doc.id}/download`,
        }, req.requestId),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      logger.error({ err, captureId }, 'Win themes generation failed');
      if (message.includes('not found')) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', message, req.requestId),
        );
      }
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', message, req.requestId),
      );
    }
  });

  /**
   * GET /v3/output-generators/:id/download
   * Returns the PDF binary stream
   */
  app.get<{
    Params: { id: string };
  }>('/v3/output-generators/:id/download', async (req, reply) => {
    const { id } = req.params;

    const res = await pool.query<{ file_path: string; doc_kind: string }>(
      'SELECT file_path, doc_kind FROM generated_documents WHERE id = $1',
      [id],
    );
    const row = res.rows[0];
    if (!row) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Generated document not found', req.requestId),
      );
    }

    if (!existsSync(row.file_path)) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'PDF file not found on disk', req.requestId),
      );
    }

    const filename = row.file_path.split('/').pop() ?? `${row.doc_kind}.pdf`;
    void reply.header('Content-Type', 'application/pdf');
    void reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(createReadStream(row.file_path));
  });

  /**
   * GET /v3/output-generators/list
   * Query: opportunity_id?, capture_id?, doc_kind?, limit?
   */
  app.get<{
    Querystring: {
      opportunity_id?: string;
      capture_id?: string;
      doc_kind?: string;
      limit?: string;
    };
  }>('/v3/output-generators/list', async (req, reply) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (req.query.opportunity_id) {
      conditions.push(`gd.opportunity_id = $${idx++}`);
      params.push(Number(req.query.opportunity_id));
    }
    if (req.query.capture_id) {
      conditions.push(`gd.capture_id = $${idx++}`);
      params.push(Number(req.query.capture_id));
    }
    if (req.query.doc_kind) {
      conditions.push(`gd.doc_kind = $${idx++}`);
      params.push(req.query.doc_kind);
    }

    const limit = Math.min(parseInt(req.query.limit ?? '50', 10) || 50, 200);
    params.push(limit);
    const limitParam = `$${idx}`;

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const res = await pool.query<GeneratedDocListRow>(
      `SELECT gd.id, gd.doc_kind, gd.opportunity_id::text, gd.capture_id::text,
              gd.vault_doc_id, gd.file_path, gd.file_size_bytes, gd.created_at,
              o.title AS opportunity_title
       FROM generated_documents gd
       LEFT JOIN opportunities o ON o.id = gd.opportunity_id
       ${where}
       ORDER BY gd.created_at DESC
       LIMIT ${limitParam}`,
      params,
    );

    return reply.status(200).send(
      successEnvelope({
        items: res.rows.map((r) => ({
          id: Number(r.id),
          doc_kind: r.doc_kind,
          opportunity_id: r.opportunity_id,
          capture_id: r.capture_id,
          vault_doc_id: r.vault_doc_id,
          file_size_bytes: r.file_size_bytes,
          created_at: r.created_at,
          opportunity_title: r.opportunity_title,
          download_url: `/v3/output-generators/${r.id}/download`,
        })),
      }, req.requestId),
    );
  });
}
