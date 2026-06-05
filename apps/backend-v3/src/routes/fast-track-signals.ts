/**
 * Fast Track — Need Sensing routes
 *
 * Endpoints:
 *   GET  /v3/fast-track/signals              — all signals, filterable by pipeline, urgency, mission, side
 *   GET  /v3/fast-track/signals/matches      — matched signal pairs with scores
 *   GET  /v3/fast-track/matches/:id/analysis — cached match analysis
 *   POST /v3/fast-track/matches/:id/analyze  — run AI match analysis
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
  pipeline_side: string;
  institution_type: string | null;
  institution_name: string | null;
  doi: string | null;
}

interface MatchRow {
  id: string;
  tech_id: string;
  tech_source: string;
  tech_title: string;
  tech_mission_tags: string[];
  tech_source_url: string | null;
  req_id: string;
  req_source: string;
  req_title: string;
  req_mission_tags: string[];
  req_source_url: string | null;
  mission_fit_score: string;
  technical_fit_score: string;
  timing_score: string;
  adoption_path: string | null;
  recommended_vehicle: string | null;
  match_rationale: string | null;
  computed_at: string;
}

interface MatchAnalysisRow {
  id: number;
  match_id: number;
  broker_role: string | null;
  gap_analysis: string | null;
  recommended_actions: unknown;
  risk_flags: unknown;
  envision_fit: string | null;
  ai_narrative: string | null;
  model_used: string | null;
  generated_at: string;
}

export async function fastTrackSignalRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /v3/fast-track/signals ──────────────────────────────────────────
  app.get('/v3/fast-track/signals', async (req, reply) => {
    const qs = req.query as Record<string, string>;
    const pipeline = qs.pipeline ?? null;       // 'tech' | 'requirement'
    const urgency  = qs.urgency  ?? null;
    const mission  = qs.mission  ?? null;       // partial match against mission_tags
    const side     = qs.side     ?? null;       // 'government' | 'industry'
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
      if (side) {
        conditions.push(`pipeline_side = $${idx++}`);
        params.push(side);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `
        SELECT
          id, pipeline, source, title, summary,
          mission_tags, problem_tags, maturity, urgency, horizon,
          signal_strength, transition_tags, source_url,
          published_at, ingested_at, next_review_at, next_review_action,
          pipeline_side, institution_type, institution_name, doi
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
      }, req.requestId));
    } catch (err) {
      app.log.error(err, 'fast-track signals list failed');
      return reply.status(500).send(errorEnvelope('INTERNAL_ERROR', 'Failed to fetch signals', req.requestId));
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
          t.source_url    AS tech_source_url,
          r.id            AS req_id,
          r.source        AS req_source,
          r.title         AS req_title,
          r.mission_tags  AS req_mission_tags,
          r.source_url    AS req_source_url,
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

      return reply.send(successEnvelope({ matches: rows, total: rows.length }, req.requestId));
    } catch (err) {
      app.log.error(err, 'fast-track matches list failed');
      return reply.status(500).send(errorEnvelope('INTERNAL_ERROR', 'Failed to fetch matches', req.requestId));
    }
  });

  // ── GET /v3/fast-track/matches/:id/analysis ────────────────────────────
  app.get('/v3/fast-track/matches/:id/analysis', async (req, reply) => {
    const matchId = parseInt((req.params as { id: string }).id, 10);
    if (isNaN(matchId)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid match ID', req.requestId));
    }

    try {
      const { rows } = await pool.query<MatchAnalysisRow>(
        `SELECT * FROM fast_track_match_analysis WHERE match_id = $1`,
        [matchId],
      );

      if (rows.length === 0) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', 'No analysis found for this match', req.requestId));
      }

      return reply.send(successEnvelope(rows[0], req.requestId));
    } catch (err) {
      app.log.error(err, 'fast-track match analysis fetch failed');
      return reply.status(500).send(errorEnvelope('INTERNAL_ERROR', 'Failed to fetch match analysis', req.requestId));
    }
  });

  // ── POST /v3/fast-track/matches/:id/analyze ────────────────────────────
  app.post('/v3/fast-track/matches/:id/analyze', async (req, reply) => {
    const matchId = parseInt((req.params as { id: string }).id, 10);
    if (isNaN(matchId)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid match ID', req.requestId));
    }

    try {
      // Check cache first
      const cacheResult = await pool.query<MatchAnalysisRow>(
        `SELECT * FROM fast_track_match_analysis WHERE match_id = $1`,
        [matchId],
      );
      if (cacheResult.rows.length > 0) {
        return reply.send(successEnvelope({ ...cacheResult.rows[0], from_cache: true }, req.requestId));
      }

      // Fetch match + signal data
      const matchResult = await pool.query<MatchRow>(`
        SELECT
          m.id,
          t.id            AS tech_id,
          t.source        AS tech_source,
          t.title         AS tech_title,
          t.mission_tags  AS tech_mission_tags,
          t.source_url    AS tech_source_url,
          r.id            AS req_id,
          r.source        AS req_source,
          r.title         AS req_title,
          r.mission_tags  AS req_mission_tags,
          r.source_url    AS req_source_url,
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
        WHERE m.id = $1
      `, [matchId]);

      if (matchResult.rows.length === 0) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', `Match ${matchId} not found`, req.requestId));
      }

      const match = matchResult.rows[0];

      const { llmRouter } = await import('../lib/llm-router.js');
      const result = await llmRouter.route({
        task: 'match_analysis',
        input: {
          match_id: matchId,
          tech_title: match.tech_title,
          tech_source: match.tech_source,
          req_title: match.req_title,
          req_source: match.req_source,
          mission_fit: parseFloat(match.mission_fit_score),
          technical_fit: parseFloat(match.technical_fit_score),
          timing: parseFloat(match.timing_score),
          recommended_vehicle: match.recommended_vehicle,
        },
      });

      if (!result.ok) {
        return reply.status(502).send(
          errorEnvelope('INTERNAL_ERROR', result.error_message ?? 'LLM router failed', req.requestId),
        );
      }

      const analysis = result.output;

      // Upsert cache
      await pool.query(
        `INSERT INTO fast_track_match_analysis
          (match_id, broker_role, gap_analysis, recommended_actions, risk_flags, envision_fit, ai_narrative, model_used, generated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (match_id)
         DO UPDATE SET
           broker_role = $2, gap_analysis = $3, recommended_actions = $4,
           risk_flags = $5, envision_fit = $6, ai_narrative = $7,
           model_used = $8, generated_at = NOW()`,
        [
          matchId,
          analysis.broker_role,
          analysis.gap_analysis,
          JSON.stringify(analysis.recommended_actions),
          JSON.stringify(analysis.risk_flags),
          analysis.envision_fit,
          analysis.ai_narrative,
          result.model_used,
        ],
      );

      return reply.send(
        successEnvelope({
          match_id: matchId,
          broker_role: analysis.broker_role,
          gap_analysis: analysis.gap_analysis,
          recommended_actions: analysis.recommended_actions,
          risk_flags: analysis.risk_flags,
          envision_fit: analysis.envision_fit,
          ai_narrative: analysis.ai_narrative,
          model_used: result.model_used,
          generated_at: new Date().toISOString(),
          from_cache: false,
        }, req.requestId),
      );
    } catch (err) {
      app.log.error(err, 'fast-track match analysis failed');
      return reply.status(500).send(errorEnvelope('INTERNAL_ERROR', 'Failed to run match analysis', req.requestId));
    }
  });
}
