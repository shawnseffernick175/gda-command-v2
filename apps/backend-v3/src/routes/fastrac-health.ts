/**
 * FasTrac health / observability route.
 *
 * Surfaces whether the Need Sensing engine is actually working, so silent
 * failures (a dead adapter producing zero rows, a pipeline that stopped
 * ingesting, matches not generating) are visible in the UI instead of only in
 * the DB. Read-only aggregate counts — no signal bodies.
 *
 *   GET /v3/fastrac/health
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';

interface PipelineStatRow {
  pipeline: string;
  total: string;
  last_7d: string;
  with_source: string;
  null_source: string;
}

interface SourceStatRow {
  source: string;
  pipeline: string;
  total: string;
  last_7d: string;
  newest_ingested_at: string | null;
}

interface MatchStatRow {
  total: string;
  last_7d: string;
  newest_computed_at: string | null;
}

export async function fasTracHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/fastrac/health', async (req, reply) => {
    try {
      const [pipelineRes, sourceRes, matchRes] = await Promise.all([
        pool.query<PipelineStatRow>(`
          SELECT
            pipeline,
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE ingested_at > NOW() - INTERVAL '7 days')::text AS last_7d,
            COUNT(*) FILTER (WHERE source_url IS NOT NULL)::text AS with_source,
            COUNT(*) FILTER (WHERE source_url IS NULL)::text AS null_source
          FROM fast_track_signals
          GROUP BY pipeline
        `),
        pool.query<SourceStatRow>(`
          SELECT
            source,
            pipeline,
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE ingested_at > NOW() - INTERVAL '7 days')::text AS last_7d,
            MAX(ingested_at)::text AS newest_ingested_at
          FROM fast_track_signals
          GROUP BY source, pipeline
          ORDER BY pipeline, source
        `),
        pool.query<MatchStatRow>(`
          SELECT
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE computed_at > NOW() - INTERVAL '7 days')::text AS last_7d,
            MAX(computed_at)::text AS newest_computed_at
          FROM fast_track_matches
        `),
      ]);

      const emptyPipeline = { total: 0, last_7d: 0, with_source: 0, null_source: 0 };
      const pipelines: Record<'tech' | 'requirement', typeof emptyPipeline> = {
        tech: { ...emptyPipeline },
        requirement: { ...emptyPipeline },
      };
      for (const r of pipelineRes.rows) {
        if (r.pipeline === 'tech' || r.pipeline === 'requirement') {
          pipelines[r.pipeline] = {
            total: Number(r.total),
            last_7d: Number(r.last_7d),
            with_source: Number(r.with_source),
            null_source: Number(r.null_source),
          };
        }
      }

      const sources = sourceRes.rows.map((r) => {
        const last7d = Number(r.last_7d);
        const newest = r.newest_ingested_at;
        const ageDays = newest
          ? (Date.now() - new Date(newest).getTime()) / 86_400_000
          : null;
        // producing: fresh rows this week; stale: has data but nothing recent;
        // idle: no timestamp at all.
        const status = last7d > 0 ? 'producing' : ageDays !== null && ageDays <= 30 ? 'quiet' : 'stale';
        return {
          source: r.source,
          pipeline: r.pipeline,
          total: Number(r.total),
          last_7d: last7d,
          newest_ingested_at: newest,
          status,
        };
      });

      const m = matchRes.rows[0];
      const matches = {
        total: Number(m?.total ?? 0),
        last_7d: Number(m?.last_7d ?? 0),
        newest_computed_at: m?.newest_computed_at ?? null,
      };

      return reply.send(
        successEnvelope(
          { pipelines, sources, matches, generated_at: new Date().toISOString() },
          req.requestId,
        ),
      );
    } catch (err) {
      app.log.error(err, 'fastrac health failed');
      return reply
        .status(500)
        .send(errorEnvelope('INTERNAL_ERROR', 'Failed to fetch FasTrac health', req.requestId));
    }
  });
}
