import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';

export async function qaChecklistRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/qa-checklist — list all items, optional ?page_area= filter
  app.get<{
    Querystring: { page_area?: string };
  }>('/v3/qa-checklist', async (req, reply) => {
    const { page_area } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (page_area) {
      params.push(page_area);
      conditions.push(`page_area = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM qa_checklist_items ${where} ORDER BY id ASC`,
      params,
    );

    return reply.send(successEnvelope(rows, req.requestId));
  });

  // POST /v3/qa-checklist — create a new item
  app.post('/v3/qa-checklist', async (req, reply) => {
    const body = req.body as {
      page_area?: string;
      problem_summary?: string;
      category?: string;
      severity?: string;
      status?: string;
      github_issue?: string;
      github_pr?: string;
      evidence_note?: string;
      verified_live?: boolean;
      is_seed?: boolean;
    } | undefined;

    if (!body?.page_area?.trim()) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'page_area is required', req.requestId),
      );
    }
    if (!body.problem_summary?.trim()) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'problem_summary is required', req.requestId),
      );
    }
    if (!body.category?.trim()) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'category is required', req.requestId),
      );
    }
    if (!body.severity?.trim()) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'severity is required', req.requestId),
      );
    }

    const { rows } = await pool.query(
      `INSERT INTO qa_checklist_items
         (page_area, problem_summary, category, severity, status,
          github_issue, github_pr, evidence_note, verified_live, is_seed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        body.page_area.trim(),
        body.problem_summary.trim(),
        body.category.trim(),
        body.severity.trim(),
        body.status ?? 'queued',
        body.github_issue ?? null,
        body.github_pr ?? null,
        body.evidence_note ?? null,
        body.verified_live ?? false,
        body.is_seed ?? false,
      ],
    );

    return reply.status(201).send(successEnvelope(rows[0], req.requestId));
  });

  // PATCH /v3/qa-checklist/:id — update an existing item
  app.patch<{
    Params: { id: string };
  }>('/v3/qa-checklist/:id', async (req, reply) => {
    const { id } = req.params;
    const body = req.body as Record<string, unknown> | undefined;

    if (!body) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body is required', req.requestId),
      );
    }

    const allowed = [
      'page_area', 'problem_summary', 'category', 'severity', 'status',
      'github_issue', 'github_pr', 'evidence_note', 'verified_live', 'is_seed',
    ];
    const sets: string[] = [];
    const params: unknown[] = [];

    for (const key of allowed) {
      if (key in body) {
        params.push(body[key]);
        sets.push(`${key} = $${params.length}`);
      }
    }

    if (!sets.length) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'No valid fields to update', req.requestId),
      );
    }

    sets.push('last_updated = NOW()');
    params.push(Number(id));

    const { rows } = await pool.query(
      `UPDATE qa_checklist_items SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );

    if (!rows.length) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'QA checklist item not found', req.requestId),
      );
    }

    return reply.send(successEnvelope(rows[0], req.requestId));
  });

  // DELETE /v3/qa-checklist/:id — delete an item
  app.delete<{
    Params: { id: string };
  }>('/v3/qa-checklist/:id', async (req, reply) => {
    const { id } = req.params;

    const { rowCount } = await pool.query(
      'DELETE FROM qa_checklist_items WHERE id = $1',
      [Number(id)],
    );

    if (!rowCount) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'QA checklist item not found', req.requestId),
      );
    }

    return reply.status(204).send();
  });
}
