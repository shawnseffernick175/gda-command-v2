/**
 * F-450 — Batch scoring service + shared single-opportunity scorer.
 *
 * scoreSingleOpportunityPwin  — pure, no DB; used by both the batch loop
 *                               and the analysis worker.
 * batchScoreOpportunities     — on-demand backfill over the opportunities table.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { scoreV1Rules } from './rules-scorer.js';
import { recommendStatus } from './promotion.js';
import {
  extractFeaturesFromOpportunity,
  type OpportunityRow,
} from './feature-extraction.js';
import { scoreDoctrineFromContext } from '../doctrine/evaluate.js';

// ── Structured pwin object written to analysis.pwin ─────────────────────────

export interface PwinAnalysisObject {
  score: number | null;
  band: 'forecast' | 'signal' | 'discovery' | 'pass';
  reason?: string;
  model_version: string;
  top_drivers?: string[];
  days_to_due: number | null;
  scored_at: string;
}

// ── Shared single-opportunity scorer (pure) ─────────────────────────────────

/**
 * Score a single opportunity row → structured pwin object.
 * No DB access — safe for use in the analysis worker hot path.
 */
export function scoreSingleOpportunityPwin(
  row: OpportunityRow,
  now: Date = new Date(),
): PwinAnalysisObject {
  const scoredAt = now.toISOString();

  // Compute days to due
  let daysToDue: number | null = null;
  if (row.response_due_at) {
    const due = new Date(row.response_due_at);
    daysToDue = Math.floor(
      (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  // Deadline gate: response_due_at is non-null AND within 30 days or past due → pass bucket
  if (daysToDue !== null && daysToDue < 30) {
    return {
      score: null,
      band: 'pass',
      reason: daysToDue < 0 ? 'past_due' : 'insufficient_lead_time',
      days_to_due: daysToDue,
      model_version: 'v1-rules',
      scored_at: scoredAt,
    };
  }

  // Score via the real deterministic rules scorer
  const features = extractFeaturesFromOpportunity(row, now);

  // F-451: Use real doctrine engine (pure, no DB) for authoritative alignment_total
  if (row.title || row.description) {
    const docResult = scoreDoctrineFromContext({
      title: row.title ?? undefined,
      description: row.description ?? undefined,
      agency: row.agency ?? undefined,
      naics: row.naics ?? undefined,
      set_aside: row.set_aside ?? undefined,
    });
    features.doctrine_alignment_score = docResult.alignment_total;
    // Override exclusion if doctrine engine detects a hard-block
    const hardBlocks = docResult.exclusion_triggers.filter((e) => e.triggered);
    if (hardBlocks.length > 0) {
      features.exclusion_triggered = true;
      features.exclusion_ids = hardBlocks.map((e) => e.id);
    }
  }

  const result = scoreV1Rules(features, 'v1-rules');
  const band = recommendStatus(result.score);

  return {
    score: result.score,
    band,
    model_version: 'v1-rules',
    top_drivers: result.top_drivers,
    days_to_due: daysToDue,
    scored_at: scoredAt,
  };
}

// ── Batch scoring ───────────────────────────────────────────────────────────

export interface BatchScoreResult {
  processed: number;
  scored: number;
  passed: number;
  byBand: { forecast: number; signal: number; discovery: number; pass: number };
  durationMs: number;
}

const BATCH_SIZE = 250;

/**
 * Score all eligible opportunities (or a subset) and write structured
 * analysis.pwin via a jsonb merge that preserves other analysis keys.
 */
export async function batchScoreOpportunities(
  opts?: { ids?: number[]; limit?: number },
): Promise<BatchScoreResult> {
  const start = Date.now();
  const result: BatchScoreResult = {
    processed: 0,
    scored: 0,
    passed: 0,
    byBand: { forecast: 0, signal: 0, discovery: 0, pass: 0 },
    durationMs: 0,
  };

  const now = new Date();
  let lastId = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batchLimit =
      opts?.limit != null
        ? Math.min(BATCH_SIZE, opts.limit - result.processed)
        : BATCH_SIZE;

    if (batchLimit <= 0) break;

    let query: string;
    let params: unknown[];

    if (opts?.ids && opts.ids.length > 0) {
      query = `SELECT id, naics, agency, set_aside, value_min, value_max,
                      response_due_at, posted_at, incumbent, incumbent_confidence,
                      solicitation_number, title, description, psc
               FROM opportunities
               WHERE deleted_at IS NULL AND id > $1 AND id = ANY($2)
               ORDER BY id LIMIT $3`;
      params = [lastId, opts.ids, batchLimit];
    } else {
      query = `SELECT id, naics, agency, set_aside, value_min, value_max,
                      response_due_at, posted_at, incumbent, incumbent_confidence,
                      solicitation_number, title, description, psc
               FROM opportunities
               WHERE deleted_at IS NULL AND id > $1
               ORDER BY id LIMIT $2`;
      params = [lastId, batchLimit];
    }

    const res = await pool.query(query, params);
    if (res.rows.length === 0) break;

    // Process batch inside a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const dbRow of res.rows) {
        const r = dbRow as Record<string, unknown>;
        const row: OpportunityRow = {
          naics: r.naics as string | null,
          agency: r.agency as string | null,
          set_aside: r.set_aside as string | null,
          value_min: r.value_min != null ? Number(r.value_min) : null,
          value_max: r.value_max != null ? Number(r.value_max) : null,
          response_due_at: r.response_due_at as string | null,
          posted_at: r.posted_at as string | null,
          incumbent: r.incumbent as string | null,
          incumbent_confidence: r.incumbent_confidence as string | null,
          solicitation_number: r.solicitation_number as string | null,
          title: r.title as string | null,
          description: r.description as string | null,
          psc: r.psc as string | null,
        };

        const pwinObj = scoreSingleOpportunityPwin(row, now);

        // Persist — jsonb merge replacing only the pwin key
        await client.query(
          `UPDATE opportunities
           SET analysis = COALESCE(analysis, '{}'::jsonb) || jsonb_build_object('pwin', $1::jsonb),
               updated_at = NOW()
           WHERE id = $2 AND deleted_at IS NULL`,
          [JSON.stringify(pwinObj), r.id],
        );

        result.processed++;
        if (pwinObj.band === 'pass') {
          result.passed++;
          result.byBand.pass++;
        } else {
          result.scored++;
          const band = pwinObj.band as 'forecast' | 'signal' | 'discovery';
          result.byBand[band]++;
        }

        lastId = Number(r.id);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (res.rows.length < BATCH_SIZE) break;
  }

  result.durationMs = Date.now() - start;
  logger.info(result, 'Batch pwin scoring complete');
  return result;
}
