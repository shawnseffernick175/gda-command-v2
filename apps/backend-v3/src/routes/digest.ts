/**
 * Market Intelligence Digest routes — F-629 + F-611
 *
 * GET  /v3/digest          — full digest page data
 * GET  /v3/digest/signals  — paginated signal feed
 * GET  /v3/digest/lead     — today's lead story (cached)
 * POST /v3/digest/refresh  — force regenerate lead (admin only)
 * GET  /v3/digest/news     — GovCon news feed (wheelhouse-filtered)
 * GET  /v3/digest/sitrep          — list SITREPs
 * GET  /v3/digest/sitrep/:id      — single SITREP with items
 * POST /v3/digest/sitrep          — create SITREP
 * PUT  /v3/digest/sitrep/:id      — update SITREP
 * DELETE /v3/digest/sitrep/:id    — delete SITREP
 */

import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { config } from '../config/index.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import { generateDigestLead } from '../services/digest/lead-generator.js';
import { ENVISION_NAICS } from '../constants/envision-naics.js';
import { recordAuditLog } from '../services/audit/audit-log.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 3,
});

type SignalCategory = 'solicitation' | 'gao_decision' | 'regulation' | 'budget' | 'agency_intel';

interface SignalRow {
  id: string;
  type: SignalCategory;
  title: string;
  agency: string | null;
  naics_code: string | null;
  value_estimate: string | null;
  source_url: string | null;
  ai_summary: string | null;
  posted_at: string;
}

interface GaoRow {
  id: number;
  decision_number: string;
  title: string | null;
  agency: string | null;
  incumbent: string | null;
  protestor: string | null;
  outcome: string | null;
  decision_date: string | null;
  source_url: string | null;
  ai_summary: string | null;
}

interface RegulatoryRow {
  id: number;
  title: string;
  document_type: string | null;
  effective_date: string | null;
  status: string | null;
  source_url: string | null;
}

interface UpcomingOppRow {
  id: string;
  title: string;
  naics_code: string | null;
  agency: string | null;
  response_due_at: string | null;
  source_url: string | null;
}

interface NewsItemRow {
  id: number;
  title: string;
  blurb: string;
  url: string;
  source_name: string;
  published_at: string;
  is_wheelhouse: boolean;
}

interface SitrepRow {
  id: number;
  sitrep_number: number;
  week_ending: string;
  created_at: string;
}

interface SitrepItemRow {
  id: number;
  sitrep_id: number;
  topic: string;
  discussion: string;
  action_items: string;
  sort_order: number;
  created_at: string;
}

export async function digestRoutes(app: FastifyInstance): Promise<void> {

  // ─── GET /v3/digest — full page data ─────────────────────────
  app.get('/v3/digest', async (req, reply) => {
    const [lead, signals, regulatory, upcoming, gao] = await Promise.all([
      getCachedLead(),
      getSignalFeed({ limit: 20, offset: 0 }),
      getRegulatoryTracker(),
      getUpcomingSolicitations(),
      getGaoWatchlist(),
    ]);

    return reply.status(200).send(successEnvelope({
      lead,
      signals,
      regulatory,
      upcoming_solicitations: upcoming,
      gao_watchlist: gao,
      last_updated: lead?.generated_at ?? null,
    }, req.requestId));
  });

  // ─── GET /v3/digest/signals — paginated signal feed ──────────
  app.get('/v3/digest/signals', async (req, reply) => {
    const query = req.query as { limit?: string; offset?: string; category?: string };
    const limit = Math.min(parseInt(query.limit ?? '20', 10) || 20, 100);
    const offset = parseInt(query.offset ?? '0', 10) || 0;
    const category = query.category as SignalCategory | undefined;

    const signals = await getSignalFeed({ limit, offset, category });
    return reply.status(200).send(successEnvelope(signals, req.requestId));
  });

  // ─── GET /v3/digest/lead — today's lead story ────────────────
  app.get('/v3/digest/lead', async (req, reply) => {
    const lead = await getCachedLead();
    if (!lead) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'No lead story generated yet', req.requestId),
      );
    }
    return reply.status(200).send(successEnvelope(lead, req.requestId));
  });

  // ─── POST /v3/digest/refresh — force regenerate ──────────────
  app.post('/v3/digest/refresh', async (req, reply) => {
    logger.info('Digest lead refresh requested');
    try {
      const lead = await generateDigestLead(pool);
      return reply.status(200).send(successEnvelope(lead, req.requestId));
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'digest_refresh_error');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Failed to generate digest lead', req.requestId),
      );
    }
  });

  // ─── GET /v3/digest/news — GovCon news feed ──────────────────
  app.get('/v3/digest/news', async (req, reply) => {
    const query = req.query as { limit?: string };
    const limit = Math.min(parseInt(query.limit ?? '12', 10) || 12, 50);

    // Prefer wheelhouse items; if <3, relax to all recent
    let { rows } = await pool.query<NewsItemRow>(
      `SELECT id, title, blurb, url, source_name, published_at::text,
              is_wheelhouse
       FROM news_items
       WHERE is_wheelhouse = true
       ORDER BY published_at DESC
       LIMIT $1`,
      [limit],
    );

    if (rows.length < 3) {
      const relaxed = await pool.query<NewsItemRow>(
        `SELECT id, title, blurb, url, source_name, published_at::text,
                is_wheelhouse
         FROM news_items
         ORDER BY published_at DESC
         LIMIT $1`,
        [limit],
      );
      rows = relaxed.rows;
    }

    return reply.status(200).send(successEnvelope(rows, req.requestId));
  });

  // ─── SITREP CRUD ─────────────────────────────────────────────

  // GET /v3/digest/sitrep — list all SITREPs
  app.get('/v3/digest/sitrep', async (req, reply) => {
    const { rows } = await pool.query<SitrepRow>(
      `SELECT id, sitrep_number, week_ending::text, created_at::text
       FROM sitreps
       ORDER BY week_ending DESC`,
    );
    return reply.status(200).send(successEnvelope(rows, req.requestId));
  });

  // GET /v3/digest/sitrep/:id — single SITREP with items
  app.get('/v3/digest/sitrep/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const sitrepRes = await pool.query<SitrepRow>(
      `SELECT id, sitrep_number, week_ending::text, created_at::text
       FROM sitreps WHERE id = $1`,
      [id],
    );
    if (sitrepRes.rows.length === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'SITREP not found', req.requestId),
      );
    }
    const sitrep = sitrepRes.rows[0]!;
    const itemsRes = await pool.query<SitrepItemRow>(
      `SELECT id, sitrep_id, topic, discussion, action_items, sort_order,
              created_at::text
       FROM sitrep_items
       WHERE sitrep_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [id],
    );
    return reply.status(200).send(successEnvelope(
      { ...sitrep, items: itemsRes.rows },
      req.requestId,
    ));
  });

  // POST /v3/digest/sitrep — create SITREP with items
  app.post('/v3/digest/sitrep', async (req, reply) => {
    const body = req.body as {
      sitrep_number: number;
      week_ending: string;
      items?: Array<{ topic: string; discussion?: string; action_items?: string; sort_order?: number }>;
    };

    if (!body.sitrep_number || !body.week_ending) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'sitrep_number and week_ending are required', req.requestId),
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const insertRes = await client.query<{ id: number }>(
        `INSERT INTO sitreps (sitrep_number, week_ending)
         VALUES ($1, $2)
         RETURNING id`,
        [body.sitrep_number, body.week_ending],
      );
      const sitrepId = insertRes.rows[0]!.id;

      if (body.items && body.items.length > 0) {
        for (let idx = 0; idx < body.items.length; idx++) {
          const item = body.items[idx]!;
          await client.query(
            `INSERT INTO sitrep_items (sitrep_id, topic, discussion, action_items, sort_order)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              sitrepId,
              item.topic,
              item.discussion ?? '',
              item.action_items ?? '',
              item.sort_order ?? idx,
            ],
          );
        }
      }

      await recordAuditLog(client, {
        action: 'create',
        table_name: 'sitreps',
        record_id: sitrepId,
        new_values: body,
        source: 'user',
        request_id: req.requestId,
      });

      await client.query('COMMIT');

      // Return the full SITREP
      const full = await getSitrepWithItems(sitrepId);
      return reply.status(201).send(successEnvelope(full, req.requestId));
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'sitrep_create_error');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Failed to create SITREP', req.requestId),
      );
    } finally {
      client.release();
    }
  });

  // PUT /v3/digest/sitrep/:id — update SITREP and replace items
  app.put('/v3/digest/sitrep/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      sitrep_number?: number;
      week_ending?: string;
      items?: Array<{ topic: string; discussion?: string; action_items?: string; sort_order?: number }>;
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify exists
      const existing = await client.query<{ id: number }>(
        `SELECT id FROM sitreps WHERE id = $1`,
        [id],
      );
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', 'SITREP not found', req.requestId),
        );
      }

      // Update header fields if provided
      if (body.sitrep_number !== undefined || body.week_ending !== undefined) {
        const sets: string[] = [];
        const params: unknown[] = [];
        let pi = 1;
        if (body.sitrep_number !== undefined) {
          sets.push(`sitrep_number = $${pi++}`);
          params.push(body.sitrep_number);
        }
        if (body.week_ending !== undefined) {
          sets.push(`week_ending = $${pi++}`);
          params.push(body.week_ending);
        }
        params.push(id);
        await client.query(
          `UPDATE sitreps SET ${sets.join(', ')} WHERE id = $${pi}`,
          params,
        );
      }

      // Replace items if provided
      if (body.items !== undefined) {
        await client.query(`DELETE FROM sitrep_items WHERE sitrep_id = $1`, [id]);
        for (let idx = 0; idx < body.items.length; idx++) {
          const item = body.items[idx]!;
          await client.query(
            `INSERT INTO sitrep_items (sitrep_id, topic, discussion, action_items, sort_order)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              id,
              item.topic,
              item.discussion ?? '',
              item.action_items ?? '',
              item.sort_order ?? idx,
            ],
          );
        }
      }

      await recordAuditLog(client, {
        action: 'update',
        table_name: 'sitreps',
        record_id: Number(id),
        new_values: body,
        source: 'user',
        request_id: req.requestId,
      });

      await client.query('COMMIT');

      const full = await getSitrepWithItems(Number(id));
      return reply.status(200).send(successEnvelope(full, req.requestId));
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'sitrep_update_error');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Failed to update SITREP', req.requestId),
      );
    } finally {
      client.release();
    }
  });

  // DELETE /v3/digest/sitrep/:id
  app.delete('/v3/digest/sitrep/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const delRes = await client.query(`DELETE FROM sitreps WHERE id = $1 RETURNING id`, [id]);
      if (delRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', 'SITREP not found', req.requestId),
        );
      }

      await recordAuditLog(client, {
        action: 'delete',
        table_name: 'sitreps',
        record_id: Number(id),
        source: 'user',
        request_id: req.requestId,
      });

      await client.query('COMMIT');
      return reply.status(200).send(successEnvelope({ deleted: true }, req.requestId));
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'sitrep_delete_error');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Failed to delete SITREP', req.requestId),
      );
    } finally {
      client.release();
    }
  });

  // ─── Helpers ─────────────────────────────────────────────────

  async function getSitrepWithItems(sitrepId: number) {
    const sitrepRes = await pool.query<SitrepRow>(
      `SELECT id, sitrep_number, week_ending::text, created_at::text
       FROM sitreps WHERE id = $1`,
      [sitrepId],
    );
    const sitrep = sitrepRes.rows[0];
    if (!sitrep) return null;
    const itemsRes = await pool.query<SitrepItemRow>(
      `SELECT id, sitrep_id, topic, discussion, action_items, sort_order, created_at::text
       FROM sitrep_items WHERE sitrep_id = $1 ORDER BY sort_order ASC, id ASC`,
      [sitrepId],
    );
    return { ...sitrep, items: itemsRes.rows };
  }
}

// ─── Data helpers ────────────────────────────────────────────────

async function getCachedLead() {
  const { rows } = await pool.query<{ content: unknown; generated_at: string }>(
    `SELECT content, generated_at FROM digest_cache
     WHERE cache_key = 'lead_story' AND expires_at > NOW()
     ORDER BY generated_at DESC LIMIT 1`,
  );
  if (rows.length === 0) return null;
  return { ...(rows[0]!.content as Record<string, unknown>), generated_at: rows[0]!.generated_at };
}

async function getSignalFeed(opts: { limit: number; offset: number; category?: SignalCategory }) {
  const signals: SignalRow[] = [];

  // Pull from multiple sources and unify into signal feed
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  // Solicitations from opportunities (sources_sought, pre_solicitation)
  if (!opts.category || opts.category === 'solicitation') {
    const solResult = await pool.query<{
      id: string; title: string; agency: string | null;
      naics: string | null; posted_at: string | null;
      source_uri: string | null; opportunity_type: string | null;
      value_max: number | null;
    }>(
      `SELECT id::text, title, agency, naics,
              posted_at::text, source_uri, opportunity_type, value_max
       FROM opportunities
       WHERE naics = ANY($1)
         AND opportunity_type IN ('sources_sought', 'pre_solicitation', 'solicitation')
         AND posted_at >= NOW() - INTERVAL '30 days'
         AND deleted_at IS NULL
       ORDER BY posted_at DESC
       LIMIT $2 OFFSET $3`,
      [ENVISION_NAICS, opts.limit, opts.offset],
    );

    for (const row of solResult.rows) {
      signals.push({
        id: `sol-${row.id}`,
        type: 'solicitation',
        title: row.title,
        agency: row.agency,
        naics_code: row.naics,
        value_estimate: row.value_max ? `$${row.value_max.toLocaleString()}` : null,
        source_url: row.source_uri ?? null,
        ai_summary: null,
        posted_at: row.posted_at ?? new Date().toISOString(),
      });
    }
  }

  // GAO decisions
  if (!opts.category || opts.category === 'gao_decision') {
    const gaoResult = await pool.query<GaoRow>(
      `SELECT id, decision_number, title, agency, incumbent, protestor,
              outcome, decision_date::text, source_url, ai_summary
       FROM gao_decisions
       ORDER BY decision_date DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [opts.limit, opts.offset],
    );

    for (const row of gaoResult.rows) {
      signals.push({
        id: `gao-${row.id}`,
        type: 'gao_decision',
        title: row.title ?? `GAO ${row.decision_number}`,
        agency: row.agency,
        naics_code: null,
        value_estimate: null,
        source_url: row.source_url,
        ai_summary: row.ai_summary ?? (row.outcome ? `${row.protestor ?? 'Unknown'} v. ${row.incumbent ?? 'Unknown'} — ${row.outcome}` : null),
        posted_at: row.decision_date ?? new Date().toISOString(),
      });
    }
  }

  // Federal Register notices (regulations)
  if (!opts.category || opts.category === 'regulation') {
    const regResult = await pool.query<{
      id: number; title: string; document_number: string | null;
      publication_date: string | null; html_url: string | null;
      abstract: string | null;
    }>(
      `SELECT id, title, document_number, publication_date::text,
              html_url, abstract
       FROM regulatory_notices
       WHERE publication_date >= NOW() - INTERVAL '30 days'
       ORDER BY publication_date DESC
       LIMIT $1 OFFSET $2`,
      [opts.limit, opts.offset],
    );

    for (const row of regResult.rows) {
      signals.push({
        id: `reg-${row.id}`,
        type: 'regulation',
        title: row.title,
        agency: null,
        naics_code: null,
        value_estimate: null,
        source_url: row.html_url ?? null,
        ai_summary: row.abstract ? row.abstract.slice(0, 200) : null,
        posted_at: row.publication_date ?? new Date().toISOString(),
      });
    }
  }

  // Sort all signals by posted_at descending
  signals.sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());

  return {
    items: signals.slice(0, opts.limit),
    total: signals.length,
    limit: opts.limit,
    offset: opts.offset,
  };
}

async function getRegulatoryTracker() {
  const { rows } = await pool.query<RegulatoryRow>(
    `SELECT id, title, category AS document_type, effective_date::text, url AS source_url, NULL AS status
     FROM vault_regulatory_catalog
     WHERE is_active = true
     ORDER BY effective_date ASC NULLS LAST
     LIMIT 10`,
  );
  return rows;
}

async function getUpcomingSolicitations() {
  // Bug 2a: Only show in-wheelhouse opportunities (NAICS allowlist gate)
  // Bug 2b: 31-90 day timing window — CEO rule: <31d is too late to capture
  // Also exclude opportunities in terminal pipeline stages (won/lost/no_bid/gov_cancelled)
  const { rows } = await pool.query<UpcomingOppRow>(
    `SELECT o.id::text, o.title, o.naics AS naics_code, o.agency,
            o.response_due_at::text, o.source_uri AS source_url
     FROM opportunities o
     WHERE o.naics = ANY($1)
       AND o.response_due_at BETWEEN NOW() + INTERVAL '31 days' AND NOW() + INTERVAL '90 days'
       AND o.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM pipeline_items pi
         WHERE pi.opportunity_id = o.id
           AND pi.stage IN ('won', 'lost', 'no_bid', 'gov_cancelled')
       )
     ORDER BY o.response_due_at ASC
     LIMIT 10`,
    [ENVISION_NAICS],
  );
  return rows;
}

async function getGaoWatchlist() {
  const { rows } = await pool.query<GaoRow>(
    `SELECT id, decision_number, title, agency, incumbent, protestor,
            outcome, decision_date::text, source_url, ai_summary
     FROM gao_decisions
     ORDER BY decision_date DESC NULLS LAST
     LIMIT 10`,
  );
  return rows;
}
