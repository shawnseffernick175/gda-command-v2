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

  // ── GET /v3/launchpad/signals — live market intel from daily briefing + fast track ──
  app.get('/v3/launchpad/signals', async (req, reply) => {
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // Try today's briefing first, fall back to most recent
    let briefingRow: { briefing_date: string; market_intel_summary: string; generated_at: string } | null = null;
    const todayRes = await pool.query<{ briefing_date: string; market_intel_summary: string; generated_at: string }>(
      `SELECT briefing_date, market_intel_summary, generated_at::text
       FROM daily_briefing_cache
       WHERE briefing_date = $1`,
      [todayET],
    );
    if (todayRes.rows.length > 0) {
      briefingRow = todayRes.rows[0]!;
    } else {
      const fallbackRes = await pool.query<{ briefing_date: string; market_intel_summary: string; generated_at: string }>(
        `SELECT briefing_date, market_intel_summary, generated_at::text
         FROM daily_briefing_cache
         ORDER BY briefing_date DESC
         LIMIT 1`,
      );
      if (fallbackRes.rows.length > 0) {
        briefingRow = fallbackRes.rows[0]!;
      }
    }

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
      briefing_date: briefingRow?.briefing_date ?? null,
      market_intel: briefingRow?.market_intel_summary ?? null,
      ft_signals: ftRes.rows.map((r) => ({
        id: r.id,
        title: r.title,
        source: r.source,
        source_url: r.source_url,
        pipeline_side: r.pipeline,
        urgency: r.urgency,
        created_at: r.ingested_at,
      })),
      generated_at: briefingRow?.generated_at ?? new Date().toISOString(),
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
      primary_source: string | null;
    }>(
      `SELECT internal_id, title, agency, estimated_value_cents::text,
              pwin, lifecycle_stage, primary_source
       FROM unified_opportunities
       WHERE lifecycle_stage IN ('forecast', 'signal', 'pre_sol')
         AND pwin IS NOT NULL
       ORDER BY pwin DESC
       LIMIT 5`,
    );

    // Build SAM.gov source URL from linked source records
    const items = await Promise.all(
      res.rows.map(async (r) => {
        let source_url: string | null = null;
        const linkRes = await pool.query<{ source: string; source_native_id: string }>(
          `SELECT source, source_native_id FROM unified_opportunity_links
           WHERE internal_id = $1 AND source = 'sam'
           LIMIT 1`,
          [r.internal_id],
        );
        if (linkRes.rows.length > 0) {
          const nativeId = linkRes.rows[0]!.source_native_id;
          source_url = `https://sam.gov/opp/${nativeId}/view`;
        }

        return {
          internal_id: r.internal_id,
          title: r.title,
          agency: r.agency,
          value: r.estimated_value_cents != null ? Number(r.estimated_value_cents) / 100 : null,
          pwin: r.pwin,
          band: r.lifecycle_stage,
          source_url,
        };
      }),
    );

    return reply.status(200).send(successEnvelope({ items }, req.requestId));
  });
}
