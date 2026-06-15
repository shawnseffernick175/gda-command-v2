/**
 * Market Intelligence Digest routes — F-629
 *
 * GET  /v3/digest          — full digest page data
 * GET  /v3/digest/signals  — paginated signal feed
 * GET  /v3/digest/lead     — today's lead story (cached)
 * POST /v3/digest/refresh  — force regenerate lead (admin only)
 */

import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { config } from '../config/index.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import { generateDigestLead } from '../services/digest/lead-generator.js';
import { ENVISION_NAICS } from '../constants/envision-naics.js';

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
