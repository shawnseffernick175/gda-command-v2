/**
 * Fast Track routes — F-227.
 *
 * Endpoints:
 *   POST   /v3/fast-track         — triage: cache check → enqueue → sync wait → 200 or 503
 *   GET    /v3/fast-track/:id     — fetch single assessment by id
 *   GET    /v3/fast-track         — list recent assessments (cursor pagination)
 */

import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';
import { pool } from '../lib/db.js';
import { requireBoss, QUEUE_NAMES } from '../lib/queue.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import {
  fastTrackCacheHits,
  fastTrackTimeoutCount,
} from '../lib/metrics.js';
import type { FastTrackJobData } from '../workers/fast-track.js';

interface FastTrackRow {
  id: string;
  input_hash: string;
  title: string;
  description: string;
  naics_codes: string[];
  set_aside: string | null;
  place_of_performance: string | null;
  grade: string;
  rationale: string;
  naics_match_score: number;
  recommended_action: string;
  source_chips: unknown;
  model_used: string;
  analysis_version: string;
  generated_at: string;
  created_at: string;
}

function computeInputHash(body: {
  title: string;
  description: string;
  naics_codes: string[];
  set_aside: string | null;
  place_of_performance: string | null;
}): string {
  const canonical = JSON.stringify({
    title: body.title,
    description: body.description,
    naics_codes: [...body.naics_codes].sort(),
    set_aside: body.set_aside,
    place_of_performance: body.place_of_performance,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function rowToResponse(row: FastTrackRow, cacheHit: boolean) {
  return {
    id: String(row.id),
    grade: row.grade,
    rationale: row.rationale,
    naics_match_score: Number(row.naics_match_score),
    recommended_action: row.recommended_action,
    source_chips: row.source_chips,
    model_used: row.model_used,
    generated_at: new Date(row.generated_at).toISOString(),
    cache_hit: cacheHit,
  };
}

const NAICS_RE = /^\d{6}$/;

export async function fastTrackRoutes(app: FastifyInstance): Promise<void> {
  // POST /v3/fast-track — triage with cache + sync wait
  app.post('/v3/fast-track', async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;

    // Validation
    if (!body) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body is required', req.requestId),
      );
    }

    const title = body.title;
    if (typeof title !== 'string' || title.length < 1 || title.length > 500) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'title must be 1-500 characters', req.requestId),
      );
    }

    const description = body.description;
    if (typeof description !== 'string' || description.length < 1 || description.length > 50000) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'description must be 1-50000 characters', req.requestId),
      );
    }

    const naicsCodes = body.naics_codes;
    if (!Array.isArray(naicsCodes) || naicsCodes.length > 10) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'naics_codes must be an array of up to 10 codes', req.requestId),
      );
    }
    for (const code of naicsCodes) {
      if (typeof code !== 'string' || !NAICS_RE.test(code)) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', `Invalid NAICS code: ${String(code)}. Must match /^\\d{6}$/`, req.requestId),
        );
      }
    }

    const setAside = body.set_aside === undefined || body.set_aside === null
      ? null
      : typeof body.set_aside === 'string' && body.set_aside.length <= 200
        ? body.set_aside
        : undefined;
    if (setAside === undefined) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'set_aside must be a string of up to 200 characters or null', req.requestId),
      );
    }

    const pop = body.place_of_performance === undefined || body.place_of_performance === null
      ? null
      : typeof body.place_of_performance === 'string' && body.place_of_performance.length <= 200
        ? body.place_of_performance
        : undefined;
    if (pop === undefined) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'place_of_performance must be a string of up to 200 characters or null', req.requestId),
      );
    }

    const input = {
      title: title as string,
      description: description as string,
      naics_codes: naicsCodes as string[],
      set_aside: setAside,
      place_of_performance: pop,
    };

    const inputHash = computeInputHash(input);
    const analysisVersion = config.analysisVersion;

    // Cache check
    const cached = await pool.query<FastTrackRow>(
      `SELECT * FROM fast_track_assessments
       WHERE input_hash = $1 AND analysis_version = $2
       ORDER BY generated_at DESC LIMIT 1`,
      [inputHash, analysisVersion],
    );

    if (cached.rows[0]) {
      fastTrackCacheHits.inc();
      return reply.status(200).send(
        successEnvelope(rowToResponse(cached.rows[0], true), req.requestId),
      );
    }

    // Enqueue
    try {
      const boss = requireBoss();
      const jobData: FastTrackJobData = {
        input_hash: inputHash,
        input,
        analysis_version: analysisVersion,
        requestId: req.requestId,
      };
      await boss.send(QUEUE_NAMES.ANALYSIS_FAST_TRACK, jobData, {
        priority: 1,
        retryLimit: 3,
        retryDelay: 5,
        retryBackoff: true,
        singletonKey: inputHash,
      });
    } catch {
      // pg-boss not initialized (tests) — swallow
    }

    // Sync wait
    const deadline = Date.now() + config.analysisTimeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, config.analysisPollIntervalMs));
      const fresh = await pool.query<FastTrackRow>(
        `SELECT * FROM fast_track_assessments
         WHERE input_hash = $1 AND analysis_version = $2
         ORDER BY generated_at DESC LIMIT 1`,
        [inputHash, analysisVersion],
      );
      if (fresh.rows[0]) {
        return reply.status(200).send(
          successEnvelope(rowToResponse(fresh.rows[0], false), req.requestId),
        );
      }
    }

    // Timeout
    fastTrackTimeoutCount.inc();
    return reply.status(503).send(
      errorEnvelope(
        'ANALYSIS_TIMEOUT',
        'Fast track triage exceeded 10s sync window. Result will be available shortly.',
        req.requestId,
      ),
    );
  });

  // GET /v3/fast-track/:id — single assessment by primary key
  app.get<{ Params: { id: string } }>('/v3/fast-track/:id', async (req, reply) => {
    const { id } = req.params;

    const result = await pool.query<FastTrackRow>(
      'SELECT * FROM fast_track_assessments WHERE id = $1',
      [id],
    );

    if (!result.rows[0]) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', 'Assessment not found', req.requestId),
      );
    }

    return reply.status(200).send(
      successEnvelope(rowToResponse(result.rows[0], false), req.requestId),
    );
  });

  // GET /v3/fast-track — list recent assessments
  app.get('/v3/fast-track', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;

    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);

    const since = query.since
      ? new Date(query.since)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(since.getTime())) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'since must be a valid ISO-8601 date', req.requestId),
      );
    }

    const cursor = query.cursor ? String(query.cursor) : null;

    let sql: string;
    const params: unknown[] = [since.toISOString(), limit + 1];

    if (cursor) {
      sql = `SELECT * FROM fast_track_assessments
             WHERE generated_at >= $1 AND id < $3
             ORDER BY id DESC LIMIT $2`;
      params.push(cursor);
    } else {
      sql = `SELECT * FROM fast_track_assessments
             WHERE generated_at >= $1
             ORDER BY id DESC LIMIT $2`;
    }

    const result = await pool.query<FastTrackRow>(sql, params);

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;

    const data = {
      items: rows.map((r) => rowToResponse(r, false)),
      next_cursor: hasMore && rows.length > 0 ? String(rows[rows.length - 1]!.id) : null,
    };

    return reply.status(200).send(successEnvelope(data, req.requestId));
  });
}
