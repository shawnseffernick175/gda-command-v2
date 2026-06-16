/**
 * FasTrac bidirectional matching routes.
 *
 * Endpoints:
 *   POST /v3/fastrac/match-from-need      — anchor on a need, rank solution candidates
 *   POST /v3/fastrac/match-from-solution   — anchor on a solution, rank need candidates
 *   GET  /v3/fastrac/need-feed             — unmatched / lightly-matched needs
 *   GET  /v3/fastrac/solution-feed         — unmatched / lightly-matched solutions
 *   GET  /v3/fastrac/matches               — all matches with evidence, sorted by score
 *   POST /v3/fastrac/promote-match         — promote a candidate pairing into a saved match
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import type { SignalForScoring } from '../lib/fastrac-scorer.js';
import { rankCandidates, scoreMatch } from '../lib/fastrac-scorer.js';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const matchCache = new Map<string, { data: unknown; ts: number }>();

function getCached(key: string): unknown | null {
  const entry = matchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    matchCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  matchCache.set(key, { data, ts: Date.now() });
}

const SIGNAL_SELECT = `
  SELECT
    id::text, pipeline, source, title, mission_tags, problem_tags,
    horizon, signal_strength, maturity, urgency, source_url,
    institution_name, published_at::text, transition_tags
  FROM fast_track_signals
`;

function rowToSignal(row: Record<string, unknown>): SignalForScoring {
  return {
    id: String(row.id),
    pipeline: row.pipeline as 'tech' | 'requirement',
    title: row.title as string,
    source: row.source as string,
    mission_tags: (row.mission_tags as string[]) ?? [],
    problem_tags: (row.problem_tags as string[]) ?? [],
    horizon: (row.horizon as string) ?? '6-12mo',
    signal_strength: Number(row.signal_strength) || 3,
    maturity: (row.maturity as string) ?? null,
    urgency: (row.urgency as string) ?? null,
    source_url: (row.source_url as string) ?? null,
    institution_name: (row.institution_name as string) ?? null,
    published_at: (row.published_at as string) ?? null,
    transition_tags: (row.transition_tags as string[]) ?? [],
  };
}

export async function fastracBidirectionalRoutes(app: FastifyInstance): Promise<void> {

  // ── POST /v3/fastrac/match-from-need ──────────────────────────
  app.post('/v3/fastrac/match-from-need', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;
    const needSignalId = body?.need_signal_id;

    if (!needSignalId || typeof needSignalId !== 'string') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'need_signal_id is required (string)', req.requestId),
      );
    }

    const cacheKey = `match-from-need:${needSignalId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return reply.send(successEnvelope(cached, req.requestId));
    }

    try {
      const { rows: needRows } = await pool.query(
        `${SIGNAL_SELECT} WHERE id = $1`,
        [needSignalId],
      );
      if (needRows.length === 0) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', `Need signal ${needSignalId} not found`, req.requestId),
        );
      }

      const need = rowToSignal(needRows[0]);

      const { rows: solutionRows } = await pool.query(
        `${SIGNAL_SELECT} WHERE pipeline = 'tech' AND id != $1 ORDER BY signal_strength DESC LIMIT 50`,
        [needSignalId],
      );
      const solutions = solutionRows.map(rowToSignal);
      const ranked = rankCandidates(need, solutions, true, 5);

      const result = { anchor: need, candidates: ranked };
      setCache(cacheKey, result);

      return reply.send(successEnvelope(result, req.requestId));
    } catch (err) {
      logger.error(err, 'match-from-need failed');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Failed to compute matches', req.requestId),
      );
    }
  });

  // ── POST /v3/fastrac/match-from-solution ──────────────────────
  app.post('/v3/fastrac/match-from-solution', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;
    const solutionSignalId = body?.solution_signal_id;

    if (!solutionSignalId || typeof solutionSignalId !== 'string') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'solution_signal_id is required (string)', req.requestId),
      );
    }

    const cacheKey = `match-from-solution:${solutionSignalId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return reply.send(successEnvelope(cached, req.requestId));
    }

    try {
      const { rows: solRows } = await pool.query(
        `${SIGNAL_SELECT} WHERE id = $1`,
        [solutionSignalId],
      );
      if (solRows.length === 0) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', `Solution signal ${solutionSignalId} not found`, req.requestId),
        );
      }

      const solution = rowToSignal(solRows[0]);

      const { rows: needRows } = await pool.query(
        `${SIGNAL_SELECT} WHERE pipeline = 'requirement' AND id != $1 ORDER BY signal_strength DESC LIMIT 50`,
        [solutionSignalId],
      );
      const needs = needRows.map(rowToSignal);
      const ranked = rankCandidates(solution, needs, false, 5);

      const result = { anchor: solution, candidates: ranked };
      setCache(cacheKey, result);

      return reply.send(successEnvelope(result, req.requestId));
    } catch (err) {
      logger.error(err, 'match-from-solution failed');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Failed to compute matches', req.requestId),
      );
    }
  });

  // ── GET /v3/fastrac/need-feed ─────────────────────────────────
  app.get('/v3/fastrac/need-feed', async (req, reply) => {
    const qs = req.query as Record<string, string>;
    const limit = Math.min(parseInt(qs.limit ?? '50', 10), 100);

    try {
      const { rows } = await pool.query(`
        SELECT
          s.id::text, s.pipeline, s.source, s.title, s.summary,
          s.mission_tags, s.problem_tags, s.maturity, s.urgency, s.horizon,
          s.signal_strength, s.transition_tags, s.source_url,
          s.published_at, s.ingested_at, s.institution_name,
          s.institution_type, s.pipeline_side,
          COUNT(m.id) AS match_count
        FROM fast_track_signals s
        LEFT JOIN fast_track_matches m ON m.req_signal_id = s.id
        WHERE s.pipeline = 'requirement'
        GROUP BY s.id
        HAVING COUNT(m.id) <= 1
        ORDER BY
          CASE s.urgency
            WHEN 'critical' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
            ELSE 4
          END,
          s.signal_strength DESC,
          s.ingested_at DESC
        LIMIT $1
      `, [limit]);

      return reply.send(successEnvelope({ needs: rows, total: rows.length }, req.requestId));
    } catch (err) {
      logger.error(err, 'need-feed failed');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Failed to fetch need feed', req.requestId),
      );
    }
  });

  // ── GET /v3/fastrac/solution-feed ─────────────────────────────
  app.get('/v3/fastrac/solution-feed', async (req, reply) => {
    const qs = req.query as Record<string, string>;
    const limit = Math.min(parseInt(qs.limit ?? '50', 10), 100);

    try {
      const { rows } = await pool.query(`
        SELECT
          s.id::text, s.pipeline, s.source, s.title, s.summary,
          s.mission_tags, s.problem_tags, s.maturity, s.urgency, s.horizon,
          s.signal_strength, s.transition_tags, s.source_url,
          s.published_at, s.ingested_at, s.institution_name,
          s.institution_type, s.pipeline_side,
          COUNT(m.id) AS match_count
        FROM fast_track_signals s
        LEFT JOIN fast_track_matches m ON m.tech_signal_id = s.id
        WHERE s.pipeline = 'tech'
        GROUP BY s.id
        HAVING COUNT(m.id) <= 1
        ORDER BY s.signal_strength DESC, s.ingested_at DESC
        LIMIT $1
      `, [limit]);

      return reply.send(successEnvelope({ solutions: rows, total: rows.length }, req.requestId));
    } catch (err) {
      logger.error(err, 'solution-feed failed');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Failed to fetch solution feed', req.requestId),
      );
    }
  });

  // ── GET /v3/fastrac/matches ───────────────────────────────────
  app.get('/v3/fastrac/matches', async (req, reply) => {
    const qs = req.query as Record<string, string>;
    const limit = Math.min(parseInt(qs.limit ?? '50', 10), 100);

    try {
      const { rows } = await pool.query(`
        SELECT
          m.id,
          t.id::text         AS solution_signal_id,
          t.source           AS solution_source,
          t.title            AS solution_title,
          t.mission_tags     AS solution_mission_tags,
          t.source_url       AS solution_source_url,
          t.institution_name AS solution_institution,
          r.id::text         AS need_signal_id,
          r.source           AS need_source,
          r.title            AS need_title,
          r.mission_tags     AS need_mission_tags,
          r.source_url       AS need_source_url,
          r.institution_name AS need_institution,
          m.mission_fit_score,
          m.technical_fit_score,
          m.timing_score,
          m.adoption_path,
          m.recommended_vehicle,
          m.match_rationale,
          m.evidence,
          m.computed_at
        FROM fast_track_matches m
        JOIN fast_track_signals t ON t.id = m.tech_signal_id
        JOIN fast_track_signals r ON r.id = m.req_signal_id
        ORDER BY
          (m.mission_fit_score + m.technical_fit_score + m.timing_score) DESC,
          m.computed_at DESC
        LIMIT $1
      `, [limit]);

      return reply.send(successEnvelope({ matches: rows, total: rows.length }, req.requestId));
    } catch (err) {
      logger.error(err, 'fastrac matches list failed');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Failed to fetch matches', req.requestId),
      );
    }
  });

  // ── POST /v3/fastrac/promote-match ────────────────────────────
  app.post('/v3/fastrac/promote-match', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;
    const needId = body?.need_signal_id;
    const solutionId = body?.solution_signal_id;

    if (!needId || typeof needId !== 'string' || !solutionId || typeof solutionId !== 'string') {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'need_signal_id and solution_signal_id are required', req.requestId),
      );
    }

    try {
      const { rows: needRows } = await pool.query(
        `${SIGNAL_SELECT} WHERE id = $1`, [needId],
      );
      const { rows: solRows } = await pool.query(
        `${SIGNAL_SELECT} WHERE id = $1`, [solutionId],
      );

      if (needRows.length === 0 || solRows.length === 0) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', 'Signal not found', req.requestId),
        );
      }

      const need = rowToSignal(needRows[0]);
      const solution = rowToSignal(solRows[0]);
      const scored = scoreMatch(need, solution);

      const { rows } = await pool.query(`
        INSERT INTO fast_track_matches
          (tech_signal_id, req_signal_id, mission_fit_score, technical_fit_score,
           timing_score, adoption_path, recommended_vehicle, match_rationale, evidence)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (tech_signal_id, req_signal_id) DO UPDATE SET
          mission_fit_score = EXCLUDED.mission_fit_score,
          technical_fit_score = EXCLUDED.technical_fit_score,
          timing_score = EXCLUDED.timing_score,
          adoption_path = EXCLUDED.adoption_path,
          recommended_vehicle = EXCLUDED.recommended_vehicle,
          evidence = EXCLUDED.evidence,
          computed_at = NOW()
        RETURNING id
      `, [
        solutionId,
        needId,
        scored.mission_fit_score,
        scored.technical_fit_score,
        scored.timing_score,
        scored.adoption_path,
        scored.recommended_vehicle,
        scored.evidence.pursuit_reasoning,
        JSON.stringify(scored.evidence),
      ]);

      return reply.send(successEnvelope({
        match_id: rows[0].id,
        ...scored,
      }, req.requestId));
    } catch (err) {
      logger.error(err, 'promote-match failed');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Failed to promote match', req.requestId),
      );
    }
  });
}
