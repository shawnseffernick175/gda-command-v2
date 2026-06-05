/**
 * Fast Track — Need Sensing routes
 *
 * Endpoints:
 *   GET /v3/fast-track/signals           — all signals, filterable by pipeline, urgency, mission
 *   GET /v3/fast-track/signals/matches   — matched signal pairs with scores
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';

interface SignalRow {
  id: string;
  pipeline: string;
  source: string;
  title: string;
  summary: string | null;
  mission_tags: string[];
  problem_tags: string[];
  maturity: string | null;
  urgency: string | null;
  horizon: string;
  signal_strength: number;
  transition_tags: string[];
  source_url: string | null;
  published_at: string | null;
  ingested_at: string;
  next_review_at: string | null;
  next_review_action: string | null;
}

interface MatchRow {
  id: string;
  tech_id: string;
  tech_source: string;
  tech_title: string;
  tech_mission_tags: string[];
  req_id: string;
  req_source: string;
  req_title: string;
  req_mission_tags: string[];
  mission_fit_score: string;
  technical_fit_score: string;
  timing_score: string;
  adoption_path: string | null;
  recommended_vehicle: string | null;
  match_rationale: string | null;
  computed_at: string;
}

export async function fastTrackSignalRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /v3/fast-track/signals ──────────────────────────────────────────
  app.get('/v3/fast-track/signals', async (req, reply) => {
    const qs = req.query as Record<string, string>;
    const pipeline = qs.pipeline ?? null;       // 'tech' | 'requirement'
    const urgency  = qs.urgency  ?? null;
    const mission  = qs.mission  ?? null;       // partial match against mission_tags
    const limit    = Math.min(parseInt(qs.limit ?? '100', 10), 200);

    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (pipeline) {
        conditions.push(`pipeline = $${idx++}`);
        params.push(pipeline);
      }
      if (urgency) {
        conditions.push(`urgency = $${idx++}`);
        params.push(urgency);
      }
      if (mission) {
        conditions.push(`mission_tags && $${idx++}`);
        params.push([mission]);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `
        SELECT
          id, pipeline, source, title, summary,
          mission_tags, problem_tags, maturity, urgency, horizon,
          signal_strength, transition_tags, source_url,
          published_at, ingested_at, next_review_at, next_review_action
        FROM fast_track_signals
        ${where}
        ORDER BY signal_strength DESC, ingested_at DESC
        LIMIT $${idx}
      `;
      params.push(limit);

      const { rows } = await pool.query<SignalRow>(sql, params);

      const tech = rows.filter(r => r.pipeline === 'tech');
      const requirement = rows.filter(r => r.pipeline === 'requirement');

      return reply.send(successEnvelope({
        tech,
        requirement,
        total: rows.length,
      }));
    } catch (err) {
      app.log.error(err, 'fast-track signals list failed');
      return reply.status(500).send(errorEnvelope('Failed to fetch signals'));
    }
  });

  // ── GET /v3/fast-track/signals/matches ─────────────────────────────────
  app.get('/v3/fast-track/signals/matches', async (req, reply) => {
    const qs = req.query as Record<string, string>;
    const limit = Math.min(parseInt(qs.limit ?? '50', 10), 100);

    try {
      const { rows } = await pool.query<MatchRow>(`
        SELECT
          m.id,
          t.id            AS tech_id,
          t.source        AS tech_source,
          t.title         AS tech_title,
          t.mission_tags  AS tech_mission_tags,
          r.id            AS req_id,
          r.source        AS req_source,
          r.title         AS req_title,
          r.mission_tags  AS req_mission_tags,
          m.mission_fit_score,
          m.technical_fit_score,
          m.timing_score,
          m.adoption_path,
          m.recommended_vehicle,
          m.match_rationale,
          m.computed_at
        FROM fast_track_matches m
        JOIN fast_track_signals t ON t.id = m.tech_signal_id
        JOIN fast_track_signals r ON r.id = m.req_signal_id
        ORDER BY m.mission_fit_score DESC, m.technical_fit_score DESC
        LIMIT $1
      `, [limit]);

      return reply.send(successEnvelope({ matches: rows, total: rows.length }));
    } catch (err) {
      app.log.error(err, 'fast-track matches list failed');
      return reply.status(500).send(errorEnvelope('Failed to fetch matches'));
    }
  });
}
