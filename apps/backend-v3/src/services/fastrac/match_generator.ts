/**
 * FasTrac automated match generation.
 *
 * The bidirectional scorer (lib/fastrac-scorer) already computes need↔solution
 * matches, but until now it only ran on-demand from the routes — so
 * fast_track_matches never populated on its own (production had a single seed
 * match, since purged). This job runs the same scorer across all live signals
 * on a schedule and persists the high-confidence pairings for human review.
 *
 * High precision by design (Need Sensing MVP is human-reviewed, not
 * auto-promoted): a pairing is persisted only if the two signals share at least
 * one mission tag AND the overall score clears MIN_OVERALL_SCORE. Matches are
 * idempotent (ON CONFLICT on the signal pair) and every persisted match carries
 * a source-linked evidence block (R1).
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { rankCandidates, type SignalForScoring, type ScoredMatch } from '../../lib/fastrac-scorer.js';

/** Minimum overall score for a pairing to be persisted. */
const MIN_OVERALL_SCORE = 0.5;
/** Cap persisted matches per solution to keep the review queue focused. */
const MAX_MATCHES_PER_SOLUTION = 3;
/** Bound the candidate pools scored per run. */
const NEED_POOL_LIMIT = 500;
const SOLUTION_POOL_LIMIT = 500;

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

export interface MatchGenerationResult {
  solutionsScored: number;
  needsScored: number;
  matchesPersisted: number;
  errors: number;
}

async function persistMatch(match: ScoredMatch): Promise<void> {
  await pool.query(
    `INSERT INTO fast_track_matches
       (tech_signal_id, req_signal_id, mission_fit_score, technical_fit_score,
        timing_score, adoption_path, recommended_vehicle, match_rationale, evidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (tech_signal_id, req_signal_id) DO UPDATE SET
       mission_fit_score = EXCLUDED.mission_fit_score,
       technical_fit_score = EXCLUDED.technical_fit_score,
       timing_score = EXCLUDED.timing_score,
       adoption_path = EXCLUDED.adoption_path,
       recommended_vehicle = EXCLUDED.recommended_vehicle,
       match_rationale = EXCLUDED.match_rationale,
       evidence = EXCLUDED.evidence,
       computed_at = NOW()`,
    [
      match.solution_signal_id,
      match.need_signal_id,
      match.mission_fit_score,
      match.technical_fit_score,
      match.timing_score,
      match.adoption_path,
      match.recommended_vehicle,
      match.evidence.pursuit_reasoning,
      JSON.stringify(match.evidence),
    ],
  );
}

/**
 * Score every solution against the need pool and persist the qualifying
 * pairings. Anchoring on solutions (tech signals) because they are the scarcer
 * pool once the tech pipeline is live.
 */
export async function runFastracMatchGeneration(): Promise<MatchGenerationResult> {
  logger.info('fastrac_match_generation_start');

  const [{ rows: solutionRows }, { rows: needRows }] = await Promise.all([
    pool.query(
      `${SIGNAL_SELECT} WHERE pipeline = 'tech' AND mission_tags <> '{}'
       ORDER BY signal_strength DESC, ingested_at DESC LIMIT $1`,
      [SOLUTION_POOL_LIMIT],
    ),
    pool.query(
      `${SIGNAL_SELECT} WHERE pipeline = 'requirement' AND mission_tags <> '{}'
       ORDER BY signal_strength DESC, ingested_at DESC LIMIT $1`,
      [NEED_POOL_LIMIT],
    ),
  ]);

  const solutions = solutionRows.map(rowToSignal);
  const needs = needRows.map(rowToSignal);

  let matchesPersisted = 0;
  let errors = 0;

  for (const solution of solutions) {
    // Rank the full need pool (no pre-truncation) so the overlap + threshold
    // filter sees every candidate; otherwise non-overlapping needs that clear
    // the score floor could fill a small shortlist and push out genuinely
    // overlapping matches. Cap only after filtering.
    const ranked = rankCandidates(solution, needs, false, needs.length);
    const qualifying = ranked
      .filter((m) => m.overall_score >= MIN_OVERALL_SCORE && m.evidence.mission_tag_overlap.length > 0)
      .slice(0, MAX_MATCHES_PER_SOLUTION);

    for (const match of qualifying) {
      try {
        await persistMatch(match);
        matchesPersisted++;
      } catch (err) {
        errors++;
        logger.error(
          {
            techSignalId: match.solution_signal_id,
            reqSignalId: match.need_signal_id,
            error: err instanceof Error ? err.message : String(err),
          },
          'fastrac_match_persist_error',
        );
      }
    }
  }

  const result: MatchGenerationResult = {
    solutionsScored: solutions.length,
    needsScored: needs.length,
    matchesPersisted,
    errors,
  };
  logger.info(result, 'fastrac_match_generation_complete');
  return result;
}
