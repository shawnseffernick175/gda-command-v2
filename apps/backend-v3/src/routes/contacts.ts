import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope } from '../lib/envelope.js';

export async function contactsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/contacts', async (req, reply) => {
    const query = req.query as { q?: string; agency?: string; limit?: string; cursor?: string };
    const limit = Math.min(Number(query.limit ?? 100), 200);
    const cursor = query.cursor ? Number(query.cursor) : null;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (query.q) {
      params.push(`%${query.q}%`);
      conditions.push(`(c.name ILIKE $${params.length} OR c.title ILIKE $${params.length} OR c.agency ILIKE $${params.length})`);
    }
    if (query.agency) {
      params.push(`%${query.agency}%`);
      conditions.push(`c.agency ILIKE $${params.length}`);
    }
    if (cursor) {
      params.push(cursor);
      conditions.push(`c.id < $${params.length}`);
    }

    params.push(limit + 1);
    const sql = `
      SELECT id, govtribe_id, name, title, agency, email, phone, contact_type, source_url, last_seen_at
      FROM govtribe_contacts c
      WHERE ${conditions.join(' AND ')}
      ORDER BY c.id DESC
      LIMIT $${params.length}`;

    const { rows } = await pool.query(sql, params);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1] as { id: number }).id : null;

    return reply.send(successEnvelope({ items, pagination: { hasMore, cursor: nextCursor } }, req.requestId));
  });

  app.get('/v3/contacts/count', async (req, reply) => {
    const { rows } = await pool.query('SELECT count(*)::int AS count FROM govtribe_contacts');
    return reply.send(successEnvelope({ count: (rows[0] as { count: number }).count }, req.requestId));
  });
}
