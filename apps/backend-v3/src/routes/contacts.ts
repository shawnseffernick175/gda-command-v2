import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';

const VALID_CATEGORIES = ['government', 'teaming_partner', 'competitor', 'industry', 'internal', 'other'] as const;
type ContactCategory = typeof VALID_CATEGORIES[number];

export async function contactsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/contacts', async (req, reply) => {
    const query = req.query as { q?: string; agency?: string; category?: string; limit?: string; cursor?: string };
    const limit = Math.min(Number(query.limit ?? 100), 200);
    const cursor = query.cursor ? Number(query.cursor) : null;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (query.q) {
      params.push(`%${query.q}%`);
      conditions.push(`(c.name ILIKE $${params.length} OR c.title ILIKE $${params.length} OR c.agency ILIKE $${params.length} OR c.company ILIKE $${params.length})`);
    }
    if (query.agency) {
      params.push(`%${query.agency}%`);
      conditions.push(`c.agency ILIKE $${params.length}`);
    }
    if (query.category && query.category !== 'all') {
      params.push(query.category);
      conditions.push(`c.contact_category = $${params.length}`);
    }
    if (cursor) {
      params.push(cursor);
      conditions.push(`c.id < $${params.length}`);
    }

    params.push(limit + 1);
    const sql = `
      SELECT id, govtribe_id, name, title, agency, email, phone, contact_type,
             source_url, last_seen_at, contact_category, company, linkedin_url,
             notes, relationship_score, ai_profile, ai_ran_at, is_manual,
             added_by, source_label
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
    const query = req.query as { category?: string };
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    if (query.category && query.category !== 'all') {
      params.push(query.category);
      conditions.push(`contact_category = $${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT count(*)::int AS count FROM govtribe_contacts WHERE ${conditions.join(' AND ')}`,
      params,
    );
    return reply.send(successEnvelope({ count: (rows[0] as { count: number }).count }, req.requestId));
  });

  // POST /v3/contacts — manual contact creation
  app.post('/v3/contacts', async (req, reply) => {
    const body = req.body as {
      name: string;
      title?: string;
      agency?: string;
      company?: string;
      email?: string;
      phone?: string;
      contact_category: ContactCategory;
      linkedin_url?: string;
      notes?: string;
      source_label?: string;
    };

    if (!body.name || !body.contact_category) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'name and contact_category are required', req.requestId),
      );
    }
    if (!VALID_CATEGORIES.includes(body.contact_category)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid contact_category: ${body.contact_category}`, req.requestId),
      );
    }

    const sql = `
      INSERT INTO govtribe_contacts (
        name, title, agency, company, email, phone, contact_category,
        linkedin_url, notes, source_label, is_manual, added_by, last_seen_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, 'admin', NOW())
      RETURNING *`;
    const params = [
      body.name,
      body.title ?? null,
      body.agency ?? null,
      body.company ?? null,
      body.email ?? null,
      body.phone ?? null,
      body.contact_category,
      body.linkedin_url ?? null,
      body.notes ?? null,
      body.source_label ?? 'Manual Entry',
    ];

    const { rows } = await pool.query(sql, params);
    return reply.status(201).send(successEnvelope(rows[0], req.requestId));
  });

  // PATCH /v3/contacts/:id — update editable fields
  app.patch('/v3/contacts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const allowedFields = [
      'name', 'title', 'agency', 'company', 'email', 'phone',
      'contact_category', 'linkedin_url', 'notes', 'relationship_score', 'source_label',
    ];

    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const field of allowedFields) {
      if (field in body) {
        params.push(body[field] ?? null);
        setClauses.push(`${field} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'No valid fields to update', req.requestId),
      );
    }

    params.push(Number(id));
    const sql = `UPDATE govtribe_contacts SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`;
    const { rows } = await pool.query(sql, params);

    if (rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Contact not found', req.requestId));
    }

    return reply.send(successEnvelope(rows[0], req.requestId));
  });

  // POST /v3/contacts/:id/enrich — AI enrichment
  app.post('/v3/contacts/:id/enrich', async (req, reply) => {
    const { id } = req.params as { id: string };

    const { rows: contactRows } = await pool.query(
      'SELECT * FROM govtribe_contacts WHERE id = $1',
      [Number(id)],
    );
    if (contactRows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Contact not found', req.requestId));
    }

    const contact = contactRows[0] as {
      name: string;
      title: string | null;
      agency: string | null;
      company: string | null;
      contact_category: string;
      email: string | null;
      linkedin_url: string | null;
      notes: string | null;
    };

    const { llmRouter } = await import('../lib/llm-router.js');
    const result = await llmRouter.route({
      task: 'contact_enrich',
      input: {
        name: contact.name,
        title: contact.title,
        agency_or_company: contact.agency ?? contact.company,
        category: contact.contact_category,
        email: contact.email,
        linkedin: contact.linkedin_url,
        notes: contact.notes,
      },
    });

    if (!result.ok) {
      return reply.status(502).send(
        errorEnvelope('INTERNAL_ERROR', result.error_message ?? 'LLM router failed', req.requestId),
      );
    }

    const aiProfile = result.output;
    await pool.query(
      'UPDATE govtribe_contacts SET ai_profile = $1, ai_ran_at = NOW() WHERE id = $2',
      [JSON.stringify(aiProfile), Number(id)],
    );

    const { rows: updatedRows } = await pool.query('SELECT * FROM govtribe_contacts WHERE id = $1', [Number(id)]);
    return reply.send(successEnvelope(updatedRows[0], req.requestId));
  });

  // DELETE /v3/contacts/:id — only manual contacts
  app.delete('/v3/contacts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const { rows } = await pool.query(
      'SELECT is_manual FROM govtribe_contacts WHERE id = $1',
      [Number(id)],
    );
    if (rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Contact not found', req.requestId));
    }
    if (!(rows[0] as { is_manual: boolean }).is_manual) {
      return reply.status(403).send(
        errorEnvelope('VALIDATION_ERROR', 'Cannot delete GovTribe-sourced contacts', req.requestId),
      );
    }

    await pool.query('DELETE FROM govtribe_contacts WHERE id = $1', [Number(id)]);
    return reply.status(204).send();
  });
}
