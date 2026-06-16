import type { FastifyInstance, FastifyRequest } from 'fastify';
import { successEnvelope } from '../lib/envelope.js';
import { computeSummary } from '../services/launchpad/summary.js';
import { computeFlags } from '../services/launchpad/flags.js';
import {
  getSummaryCache,
  setSummaryCache,
  getFlagsCache,
  setFlagsCache,
} from '../services/launchpad/cache.js';
import { pool } from '../lib/db.js';
import type { JwtPayload } from '../middleware/auth.js';

function getUserId(req: FastifyRequest): string {
  return (req as FastifyRequest & { user?: JwtPayload }).user?.sub ?? 'anonymous';
}

export async function launchpadRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/launchpad/summary', async (req, reply) => {
    const userId = getUserId(req);
    const cached = getSummaryCache(userId);
    if (cached) {
      return reply
        .header('X-Cache-Hit', 'true')
        .status(200)
        .send(successEnvelope(cached, req.requestId));
    }

    const summary = await computeSummary();
    setSummaryCache(userId, summary);
    return reply
      .header('X-Cache-Hit', 'false')
      .status(200)
      .send(successEnvelope(summary, req.requestId));
  });

  app.get('/v3/launchpad/flags', async (req, reply) => {
    const userId = getUserId(req);
    const cached = getFlagsCache(userId);
    if (cached) {
      return reply
        .header('X-Cache-Hit', 'true')
        .status(200)
        .send(successEnvelope(cached, req.requestId));
    }

    const result = await computeFlags();
    setFlagsCache(userId, result);
    return reply
      .header('X-Cache-Hit', 'false')
      .status(200)
      .send(successEnvelope(result, req.requestId));
  });

  // ── GET /v3/launchpad/signals — live Fast Track signals ──
  app.get('/v3/launchpad/signals', async (req, reply) => {
    // 3 most recent fast_track_signals
    const ftRes = await pool.query<{
      id: string;
      title: string;
      source: string;
      source_url: string | null;
      pipeline: string;
      urgency: string | null;
      ingested_at: string;
    }>(
      `SELECT id, title, source, source_url, pipeline, urgency, ingested_at::text
       FROM fast_track_signals
       ORDER BY ingested_at DESC
       LIMIT 3`,
    );

    const payload = {
      briefing_date: null,
      market_intel: null,
      ft_signals: ftRes.rows.map((r) => ({
        id: r.id,
        title: r.title,
        source: r.source,
        source_url: r.source_url,
        pipeline_side: r.pipeline,
        urgency: r.urgency,
        created_at: r.ingested_at,
      })),
      generated_at: new Date().toISOString(),
    };

    return reply.status(200).send(successEnvelope(payload, req.requestId));
  });

  // ── GET /v3/launchpad/top-programs — top 5 by pwin score (forecast/qualify band) ──
  app.get('/v3/launchpad/top-programs', async (req, reply) => {
    const res = await pool.query<{
      internal_id: string;
      title: string | null;
      agency: string | null;
      estimated_value_cents: string | null;
      pwin: number | null;
      lifecycle_stage: string;
      sam_native_id: string | null;
    }>(
      `SELECT o.internal_id, o.title, o.agency, o.estimated_value_cents::text,
              o.pwin, o.lifecycle_stage, l.source_native_id AS sam_native_id
       FROM unified_opportunities o
       LEFT JOIN unified_opportunity_links l
         ON l.internal_id = o.internal_id AND l.source = 'sam'
       WHERE o.lifecycle_stage IN ('forecast', 'signal', 'pre_sol')
         AND o.pwin IS NOT NULL
       ORDER BY o.pwin DESC
       LIMIT 5`,
    );

    const items = res.rows.map((r) => ({
      internal_id: r.internal_id,
      title: r.title,
      agency: r.agency,
      value: r.estimated_value_cents != null ? Number(r.estimated_value_cents) / 100 : null,
      pwin: r.pwin,
      band: r.lifecycle_stage,
      source_url: r.sam_native_id
        ? `https://sam.gov/opp/${r.sam_native_id}/view`
        : null,
    }));

    return reply.status(200).send(successEnvelope({ items }, req.requestId));
  });
}
