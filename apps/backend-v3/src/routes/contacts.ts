import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { enrichContactsBatch } from '../services/contacts/enrich-batch.js';

const VALID_CATEGORIES = ['government', 'teaming_partner', 'competitor', 'industry', 'internal', 'other'] as const;
type ContactCategory = typeof VALID_CATEGORIES[number];

const VALID_TEMPS = ['hot', 'warm', 'cold', 'unknown'] as const;

export async function contactsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/contacts', async (req, reply) => {
    const query = req.query as {
      q?: string; agency?: string; category?: string;
      temperature?: string; linked?: string; source?: string;
      limit?: string; cursor?: string; page?: string;
    };
    const page = query.page ? Number(query.page) : null;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (query.q) {
      params.push(`%${query.q}%`);
      conditions.push(`(c.name ILIKE $${params.length} OR c.title ILIKE $${params.length} OR c.agency ILIKE $${params.length} OR c.company ILIKE $${params.length} OR c.email ILIKE $${params.length})`);
    }
    if (query.agency) {
      params.push(`%${query.agency}%`);
      conditions.push(`c.agency ILIKE $${params.length}`);
    }
    if (query.category && query.category !== 'all') {
      params.push(query.category);
      conditions.push(`c.contact_category = $${params.length}`);
    }
    if (query.temperature && query.temperature !== 'all') {
      params.push(query.temperature);
      conditions.push(`c.relationship_temp = $${params.length}`);
    }
    if (query.linked === 'yes') {
      conditions.push(`(array_length(c.linked_opportunity_ids, 1) > 0 OR array_length(c.linked_capture_ids, 1) > 0)`);
    } else if (query.linked === 'no') {
      conditions.push(`(c.linked_opportunity_ids = '{}' AND c.linked_capture_ids = '{}')`);
    }
    if (query.source) {
      params.push(`%${query.source}%`);
      conditions.push(`c.source_label ILIKE $${params.length}`);
    }

    // --- Offset/page mode (mirrors Opportunities) ---
    if (page && page >= 1) {
      const limitN = Math.min(Number(query.limit ?? 50), 200);
      const offset = (Math.max(page, 1) - 1) * limitN;
      const whereClause = conditions.join(' AND ');

      const countRes = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM govtribe_contacts c WHERE ${whereClause}`,
        params,
      );
      const total = countRes.rows[0]?.total ?? 0;
      const totalPages = Math.max(Math.ceil(total / limitN), 1);

      const dataParams = [...params, limitN, offset];
      const sql = `
        SELECT c.id, c.govtribe_id, c.name, c.title, c.agency, c.email, c.phone, c.contact_type,
               c.source_url, c.last_seen_at, c.contact_category, c.company, c.linkedin_url,
               c.notes, c.relationship_score, c.ai_profile, c.ai_ran_at, c.is_manual,
               c.added_by, c.source_label,
               c.relationship_temp, c.last_contacted_at, c.contact_notes,
               c.linked_opportunity_ids, c.linked_capture_ids
        FROM govtribe_contacts c
        WHERE ${whereClause}
        ORDER BY c.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

      const { rows } = await pool.query(sql, dataParams);
      const items = rows;

      /* ── Meta counts for intelligence bar ──────────────────────── */
      const metaSql = `
        SELECT
          count(*)::int AS total_count,
          count(*) FILTER (
            WHERE relationship_temp = 'warm'
              AND (last_contacted_at IS NULL OR last_contacted_at < NOW() - INTERVAL '90 days')
          )::int AS warm_no_touch,
          count(*) FILTER (
            WHERE array_length(linked_opportunity_ids, 1) > 0
              OR array_length(linked_capture_ids, 1) > 0
          )::int AS linked_to_pursuits,
          count(DISTINCT agency) FILTER (WHERE agency IS NOT NULL)::int AS agency_count
        FROM govtribe_contacts`;
      const { rows: metaRows } = await pool.query(metaSql);
      const meta = metaRows[0] as {
        total_count: number;
        warm_no_touch: number;
        linked_to_pursuits: number;
        agency_count: number;
      };

      /* ── Resolve linked opportunity/capture titles ─────────────── */
      const allOppIds = new Set<number>();
      const allCapIds = new Set<number>();
      for (const item of items as Array<{ linked_opportunity_ids: number[]; linked_capture_ids: number[] }>) {
        for (const oid of (item.linked_opportunity_ids ?? [])) allOppIds.add(oid);
        for (const cid of (item.linked_capture_ids ?? [])) allCapIds.add(cid);
      }

      let oppMap: Record<number, { id: number; title: string; stage: string | null }> = {};
      if (allOppIds.size > 0) {
        const oppIdArr = Array.from(allOppIds);
        const { rows: oppRows } = await pool.query(
          `SELECT o.id,
                  o.title,
                  COALESCE(
                    (SELECT pi.stage FROM pipeline_items pi
                     WHERE pi.opportunity_id = o.id ORDER BY pi.id DESC LIMIT 1),
                    o.status
                  ) AS stage
           FROM opportunities o
           WHERE o.id = ANY($1)`,
          [oppIdArr],
        );
        for (const r of oppRows as Array<{ id: number; title: string; stage: string | null }>) {
          oppMap[r.id] = r;
        }
      }

      let capMap: Record<number, { id: number; title: string; color_stage: string | null }> = {};
      if (allCapIds.size > 0) {
        const capIdArr = Array.from(allCapIds);
        const { rows: capRows } = await pool.query(
          `SELECT c.id, o.title, c.color_stage
           FROM captures c
           JOIN pipeline_items p ON c.pipeline_item_id = p.id
           LEFT JOIN opportunities o ON o.id = p.opportunity_id
           WHERE c.id = ANY($1)`,
          [capIdArr],
        );
        for (const r of capRows as Array<{ id: number; title: string; color_stage: string | null }>) {
          capMap[r.id] = r;
        }
      }

      const enrichedItems = (items as Array<Record<string, unknown>>).map((item) => ({
        ...item,
        linked_opportunities: ((item.linked_opportunity_ids as number[]) ?? [])
          .map((oid: number) => oppMap[oid])
          .filter(Boolean),
        linked_captures: ((item.linked_capture_ids as number[]) ?? [])
          .map((cid: number) => capMap[cid])
          .filter(Boolean),
      }));

      return reply.send(successEnvelope({
        items: enrichedItems,
        pagination: { hasMore: page < totalPages, cursor: null, page, totalPages, total },
        meta,
      }, req.requestId));
    }

    // --- Existing cursor mode (unchanged) ---
    const limit = Math.min(Number(query.limit ?? 100), 200);
    const cursor = query.cursor ? Number(query.cursor) : null;

    if (cursor) {
      params.push(cursor);
      conditions.push(`c.id < $${params.length}`);
    }

    params.push(limit + 1);
    const sql = `
      SELECT c.id, c.govtribe_id, c.name, c.title, c.agency, c.email, c.phone, c.contact_type,
             c.source_url, c.last_seen_at, c.contact_category, c.company, c.linkedin_url,
             c.notes, c.relationship_score, c.ai_profile, c.ai_ran_at, c.is_manual,
             c.added_by, c.source_label,
             c.relationship_temp, c.last_contacted_at, c.contact_notes,
             c.linked_opportunity_ids, c.linked_capture_ids
      FROM govtribe_contacts c
      WHERE ${conditions.join(' AND ')}
      ORDER BY c.id DESC
      LIMIT $${params.length}`;

    const { rows } = await pool.query(sql, params);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1] as { id: number }).id : null;

    /* ── Meta counts for intelligence bar ──────────────────────── */
    const metaSql = `
      SELECT
        count(*)::int AS total_count,
        count(*) FILTER (
          WHERE relationship_temp = 'warm'
            AND (last_contacted_at IS NULL OR last_contacted_at < NOW() - INTERVAL '90 days')
        )::int AS warm_no_touch,
        count(*) FILTER (
          WHERE array_length(linked_opportunity_ids, 1) > 0
            OR array_length(linked_capture_ids, 1) > 0
        )::int AS linked_to_pursuits,
        count(DISTINCT agency) FILTER (WHERE agency IS NOT NULL)::int AS agency_count
      FROM govtribe_contacts`;
    const { rows: metaRows } = await pool.query(metaSql);
    const meta = metaRows[0] as {
      total_count: number;
      warm_no_touch: number;
      linked_to_pursuits: number;
      agency_count: number;
    };

    /* ── Resolve linked opportunity/capture titles ─────────────── */
    const allOppIds = new Set<number>();
    const allCapIds = new Set<number>();
    for (const item of items as Array<{ linked_opportunity_ids: number[]; linked_capture_ids: number[] }>) {
      for (const oid of (item.linked_opportunity_ids ?? [])) allOppIds.add(oid);
      for (const cid of (item.linked_capture_ids ?? [])) allCapIds.add(cid);
    }

    let oppMap: Record<number, { id: number; title: string; stage: string | null }> = {};
    if (allOppIds.size > 0) {
      const oppIdArr = Array.from(allOppIds);
      const { rows: oppRows } = await pool.query(
        `SELECT o.id,
                o.title,
                COALESCE(
                  (SELECT pi.stage FROM pipeline_items pi
                   WHERE pi.opportunity_id = o.id ORDER BY pi.id DESC LIMIT 1),
                  o.status
                ) AS stage
         FROM opportunities o
         WHERE o.id = ANY($1)`,
        [oppIdArr],
      );
      for (const r of oppRows as Array<{ id: number; title: string; stage: string | null }>) {
        oppMap[r.id] = r;
      }
    }

    let capMap: Record<number, { id: number; title: string; color_stage: string | null }> = {};
    if (allCapIds.size > 0) {
      const capIdArr = Array.from(allCapIds);
      const { rows: capRows } = await pool.query(
        `SELECT c.id, o.title, c.color_stage
         FROM captures c
         JOIN pipeline_items p ON c.pipeline_item_id = p.id
         LEFT JOIN opportunities o ON o.id = p.opportunity_id
         WHERE c.id = ANY($1)`,
        [capIdArr],
      );
      for (const r of capRows as Array<{ id: number; title: string; color_stage: string | null }>) {
        capMap[r.id] = r;
      }
    }

    const enrichedItems = (items as Array<Record<string, unknown>>).map((item) => ({
      ...item,
      linked_opportunities: ((item.linked_opportunity_ids as number[]) ?? [])
        .map((oid: number) => oppMap[oid])
        .filter(Boolean),
      linked_captures: ((item.linked_capture_ids as number[]) ?? [])
        .map((cid: number) => capMap[cid])
        .filter(Boolean),
    }));

    return reply.send(successEnvelope({ items: enrichedItems, pagination: { hasMore, cursor: nextCursor }, meta }, req.requestId));
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

  // POST /v3/contacts/enrich-batch -- batch AI enrichment
  app.post('/v3/contacts/enrich-batch', async (req, reply) => {
    const body = req.body as {
      categories?: string[];
      limit?: number;
      only_unenriched?: boolean;
    } | null;

    const result = await enrichContactsBatch({
      categories: body?.categories,
      limit: body?.limit,
      only_unenriched: body?.only_unenriched,
    });

    return reply.send(successEnvelope(result, req.requestId));
  });

  // PATCH /v3/contacts/:id — update editable fields
  app.patch('/v3/contacts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const allowedFields = [
      'name', 'title', 'agency', 'company', 'email', 'phone',
      'contact_category', 'linkedin_url', 'notes', 'relationship_score', 'source_label',
      'relationship_temp', 'last_contacted_at', 'contact_notes',
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

  // POST /v3/contacts/:id/log-contact — set last_contacted_at = NOW()
  app.post('/v3/contacts/:id/log-contact', async (req, reply) => {
    const { id } = req.params as { id: string };

    const { rows } = await pool.query(
      `UPDATE govtribe_contacts SET last_contacted_at = NOW() WHERE id = $1 RETURNING *`,
      [Number(id)],
    );
    if (rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Contact not found', req.requestId));
    }
    return reply.send(successEnvelope(rows[0], req.requestId));
  });

  // POST /v3/contacts/:id/link — add opportunity_id or capture_id to linked arrays
  app.post('/v3/contacts/:id/link', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { opportunity_id?: number; capture_id?: number };

    if (!body.opportunity_id && !body.capture_id) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'opportunity_id or capture_id required', req.requestId),
      );
    }

    let sql: string;
    let params: unknown[];

    if (body.opportunity_id) {
      sql = `UPDATE govtribe_contacts
             SET linked_opportunity_ids = array_append(
               array_remove(linked_opportunity_ids, $1), $1
             )
             WHERE id = $2 RETURNING *`;
      params = [body.opportunity_id, Number(id)];
    } else {
      sql = `UPDATE govtribe_contacts
             SET linked_capture_ids = array_append(
               array_remove(linked_capture_ids, $1), $1
             )
             WHERE id = $2 RETURNING *`;
      params = [body.capture_id, Number(id)];
    }

    const { rows } = await pool.query(sql, params);
    if (rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Contact not found', req.requestId));
    }
    return reply.send(successEnvelope(rows[0], req.requestId));
  });

  // POST /v3/contacts/:id/unlink — remove opportunity_id or capture_id from linked arrays
  app.post('/v3/contacts/:id/unlink', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { opportunity_id?: number; capture_id?: number };

    if (!body.opportunity_id && !body.capture_id) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'opportunity_id or capture_id required', req.requestId),
      );
    }

    let sql: string;
    let params: unknown[];

    if (body.opportunity_id) {
      sql = `UPDATE govtribe_contacts SET linked_opportunity_ids = array_remove(linked_opportunity_ids, $1) WHERE id = $2 RETURNING *`;
      params = [body.opportunity_id, Number(id)];
    } else {
      sql = `UPDATE govtribe_contacts SET linked_capture_ids = array_remove(linked_capture_ids, $1) WHERE id = $2 RETURNING *`;
      params = [body.capture_id, Number(id)];
    }

    const { rows } = await pool.query(sql, params);
    if (rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Contact not found', req.requestId));
    }
    return reply.send(successEnvelope(rows[0], req.requestId));
  });

  // GET /v3/contacts/search-linkable — search opportunities + captures for link modal
  app.get('/v3/contacts/search-linkable', async (req, reply) => {
    const query = req.query as { q?: string };
    const q = query.q ?? '';
    const pattern = `%${q}%`;

    const [oppResult, capResult] = await Promise.all([
      pool.query(
        `SELECT o.id,
                o.title,
                COALESCE(
                  (SELECT pi.stage FROM pipeline_items pi
                   WHERE pi.opportunity_id = o.id ORDER BY pi.id DESC LIMIT 1),
                  o.status
                ) AS stage,
                o.value_max AS value
         FROM opportunities o
         WHERE o.title ILIKE $1
         ORDER BY o.id DESC
         LIMIT 20`,
        [pattern],
      ),
      pool.query(
        `SELECT c.id, o.title, c.color_stage AS stage
         FROM captures c
         JOIN pipeline_items p ON c.pipeline_item_id = p.id
         LEFT JOIN opportunities o ON o.id = p.opportunity_id
         WHERE o.title ILIKE $1
         ORDER BY c.id DESC
         LIMIT 20`,
        [pattern],
      ),
    ]);

    return reply.send(successEnvelope({
      opportunities: oppResult.rows,
      captures: capResult.rows,
    }, req.requestId));
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

    // Stamp the actual router-resolved model over whatever the LLM self-reported
    // in its JSON (it tends to write a generic "gpt-4"). Provenance must reflect
    // the model the router truly used (see llm-router.table.ts routing).
    const aiProfile = { ...result.output, model_used: result.model_used };
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
