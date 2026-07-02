import type { FastifyInstance, FastifyRequest } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
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
import {
  getActionItemsWithReadyDrafts,
  getAssignee,
  toApiShape,
} from '../services/action-items/index.js';
import {
  getDraftsByActionItem,
  toDraftApiShape,
} from '../services/drafts/index.js';
import { getDailyNews } from '../services/launchpad/daily-news.js';
import { getDay1Banners, dismissBanner } from '../services/launchpad/day1-banners.js';
import { getDoorSummaries } from '../services/launchpad/door-summaries.js';
import { recordNewsFeedback } from '../services/launchpad/news-feedback.js';
import type { FeedbackAction } from '../services/launchpad/news-feedback.js';

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

  // F-310: GET /v3/launchpad/what-needs-me — action items with drafts, ranked by priority x due
  app.get<{
    Querystring: { limit?: string };
  }>('/v3/launchpad/what-needs-me', async (req, reply) => {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 7;
    const items = await getActionItemsWithReadyDrafts(limit);

    const shaped = await Promise.all(
      items.map(async (item) => {
        const [drafts, assignee] = await Promise.all([
          getDraftsByActionItem(item.id),
          getAssignee(item.assignee_id),
        ]);
        return toApiShape(item, drafts.map(toDraftApiShape), assignee);
      })
    );

    return reply.status(200).send(
      successEnvelope({ items: shaped, generated_at: new Date().toISOString() }, req.requestId)
    );
  });

  // ── F-308: GET /v3/launchpad/daily-news ──
  app.get<{
    Querystring: { limit?: string; show_excluded?: string };
  }>('/v3/launchpad/daily-news', async (req, reply) => {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 15;
    const showExcluded = req.query.show_excluded === 'true';
    const result = await getDailyNews({ limit, showExcluded });
    return reply.status(200).send(successEnvelope(result, req.requestId));
  });

  // ── F-308: GET /v3/launchpad/day-1-banners ──
  app.get('/v3/launchpad/day-1-banners', async (req, reply) => {
    const result = await getDay1Banners();
    return reply.status(200).send(successEnvelope(result, req.requestId));
  });

  // ── F-308: POST /v3/launchpad/day-1-banners/:id/dismiss ──
  app.post<{
    Params: { id: string };
  }>('/v3/launchpad/day-1-banners/:id/dismiss', async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid banner id', req.requestId));
    }
    await dismissBanner(id);
    return reply.status(200).send(successEnvelope({ dismissed: true }, req.requestId));
  });

  // ── F-308: GET /v3/launchpad/door-summaries ──
  app.get('/v3/launchpad/door-summaries', async (req, reply) => {
    try {
      const result = await getDoorSummaries();
      return reply.status(200).send(successEnvelope(result, req.requestId));
    } catch (err) {
      req.log.error({ error: err instanceof Error ? err.message : String(err) }, 'door-summaries failed');
      return reply.status(200).send(successEnvelope({
        summaries: [],
        generated_at: new Date().toISOString(),
      }, req.requestId));
    }
  });

  // ── F-308: GET /v3/launchpad/risks-roll-up — same as /v3/risks/launchpad ──
  app.get<{
    Querystring: { limit?: string };
  }>('/v3/launchpad/risks-roll-up', async (req, reply) => {
    const limit = req.query.limit ? Math.min(Number(req.query.limit || 5), 20) : 5;

    const { rows } = await pool.query(
      `SELECT r.*, o.title AS opportunity_title
       FROM risks r
       LEFT JOIN opportunities o ON o.id = r.opportunity_id
       WHERE r.status = 'open' AND r.severity IN ('critical', 'high')
       ORDER BY
         CASE r.severity WHEN 'critical' THEN 0 ELSE 1 END,
         r.score DESC,
         r.identified_at ASC
       LIMIT $1`,
      [limit],
    );

    const totalRes = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM risks WHERE status = 'open' AND severity IN ('critical', 'high')`,
    );

    return reply.status(200).send(successEnvelope({
      items: rows,
      total: totalRes.rows[0]?.total ?? 0,
    }, req.requestId));
  });

  // ── F-308: POST /v3/launchpad/news-feedback ──
  app.post<{
    Body: { news_id: number; action: string };
  }>('/v3/launchpad/news-feedback', async (req, reply) => {
    const { news_id, action } = req.body;
    const validActions: FeedbackAction[] = ['clicked', 'dismissed', 'saved'];
    if (!validActions.includes(action as FeedbackAction)) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Invalid action. Must be one of: ${validActions.join(', ')}`, req.requestId),
      );
    }
    const userId = getUserId(req);
    await recordNewsFeedback({ news_id, action: action as FeedbackAction, user_id: userId });
    return reply.status(200).send(successEnvelope({ recorded: true }, req.requestId));
  });
}
