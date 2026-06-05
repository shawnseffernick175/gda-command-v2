import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope } from '../lib/envelope.js';

export async function risksRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/risks
  app.get('/v3/risks', async (req, reply) => {
    const query = req.query as { status?: string; category?: string };
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (query.status) {
      params.push(query.status);
      conditions.push(`r.status = $${params.length}`);
    }
    if (query.category) {
      params.push(query.category);
      conditions.push(`r.category = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT r.*, o.title AS opportunity_title
       FROM risks r
       LEFT JOIN opportunities o ON o.id = r.opportunity_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.score DESC, r.created_at DESC`,
      params,
    );

    return reply.send(successEnvelope({ items: rows, total: rows.length }, req.requestId));
  });

  // POST /v3/risks
  app.post('/v3/risks', async (req, reply) => {
    const body = req.body as {
      title: string;
      description?: string;
      category?: string;
      likelihood?: number;
      impact?: number;
      status?: string;
      owner?: string;
      mitigation?: string;
      opportunity_id?: number | null;
    };

    if (!body.title?.trim()) {
      return reply.status(400).send({ error: 'title is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO risks
         (title, description, category, likelihood, impact, status, owner, mitigation, opportunity_id, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual')
       RETURNING *`,
      [
        body.title.trim(),
        body.description ?? null,
        body.category ?? 'operational',
        body.likelihood ?? 3,
        body.impact ?? 3,
        body.status ?? 'open',
        body.owner ?? null,
        body.mitigation ?? null,
        body.opportunity_id ?? null,
      ],
    );

    return reply.status(201).send(successEnvelope(rows[0], req.requestId));
  });

  // PATCH /v3/risks/:id
  app.patch('/v3/risks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const allowed = ['title', 'description', 'category', 'likelihood', 'impact', 'status', 'owner', 'mitigation'];
    const sets: string[] = [];
    const params: unknown[] = [];

    for (const key of allowed) {
      if (key in body) {
        params.push(body[key]);
        sets.push(`${key} = $${params.length}`);
      }
    }

    if (!sets.length) {
      return reply.status(400).send({ error: 'No valid fields to update' });
    }

    sets.push('updated_at = NOW()');
    params.push(Number(id));

    const { rows } = await pool.query(
      `UPDATE risks SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );

    if (!rows.length) {
      return reply.status(404).send({ error: 'Risk not found' });
    }

    return reply.send(successEnvelope(rows[0], req.requestId));
  });

  // DELETE /v3/risks/:id
  app.delete('/v3/risks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await pool.query('DELETE FROM risks WHERE id = $1', [Number(id)]);
    return reply.status(204).send();
  });
}
