/**
 * Intake assessment service.
 *
 * Sweeps opportunities sitting in `assessment_status = 'intake'`, scores each
 * with the existing deterministic pWin scorer, applies the ordered assessment
 * rules (see ./rules.ts), and writes the resulting status / reason / score back
 * to the opportunity.
 *
 * ASSESSMENT ONLY: this service NEVER touches pipeline_items. Survivors land in
 * 'ops_tracker' for the user to triage; the user is the only path into the
 * pipeline (see services/assessment promote / routes/intake-assessment.ts).
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { scoreSingleOpportunityPwin } from '../pwin/batch-score.js';
import type { OpportunityRow } from '../pwin/feature-extraction.js';
import { assessOpportunity, type AssessmentDecision } from './rules.js';

export interface AssessmentRunResult {
  scanned: number;
  passed: number;
  ops_tracker: number;
  by_reason: Record<string, number>;
}

interface IntakeRow {
  id: string;
  naics: string | null;
  agency: string | null;
  set_aside: string | null;
  value_min: number | null;
  value_max: number | null;
  response_due_at: string | null;
  posted_at: string | null;
  incumbent: string | null;
  incumbent_confidence: string | null;
  solicitation_number: string | null;
  title: string | null;
  description: string | null;
  psc: string | null;
  opportunity_type: string | null;
  part_number: string | null;
  quantity: number | null;
}

/**
 * Assess a single already-loaded opportunity row (pure-ish: only DB write is the
 * status update). Exposed so the analysis worker can assess one opp inline.
 */
export async function assessAndPersist(row: IntakeRow): Promise<AssessmentDecision> {
  const oppRow: OpportunityRow = {
    naics: row.naics,
    agency: row.agency,
    set_aside: row.set_aside,
    value_min: row.value_min,
    value_max: row.value_max,
    response_due_at: row.response_due_at,
    posted_at: row.posted_at,
    incumbent: row.incumbent,
    incumbent_confidence: row.incumbent_confidence,
    solicitation_number: row.solicitation_number,
    title: row.title,
    description: row.description,
    psc: row.psc,
  };

  // Only score when the cheaper gates (naics, deadline, commodity) haven't
  // already decided a pass — but scoring is pure and cheap, so compute once.
  const pwin = scoreSingleOpportunityPwin(oppRow);

  const decision = assessOpportunity({
    naics: row.naics,
    response_due_at: row.response_due_at,
    psc: row.psc,
    opportunity_type: row.opportunity_type,
    part_number: row.part_number,
    quantity: row.quantity,
    pwin_band: pwin.band,
    pwin_score: pwin.score,
  });

  await pool.query(
    `UPDATE opportunities
        SET assessment_status = $1,
            assessment_reason = $2,
            assessment_score  = $3,
            assessed_at       = NOW(),
            updated_at        = NOW()
      WHERE id = $4 AND deleted_at IS NULL`,
    [decision.status, decision.reason, decision.score, row.id],
  );

  return decision;
}

const INTAKE_SELECT = `
  SELECT id::text, naics, agency, set_aside, value_min, value_max,
         response_due_at::text, posted_at::text, incumbent, incumbent_confidence,
         solicitation_number, title, description, psc,
         opportunity_type, part_number, quantity
    FROM opportunities
   WHERE deleted_at IS NULL
     AND assessment_status = 'intake'
   ORDER BY id
   LIMIT $1
`;

/**
 * Run the assessment sweep over all intake opportunities, in batches.
 */
export async function runIntakeAssessment(opts?: { batchSize?: number }): Promise<AssessmentRunResult> {
  const batchSize = opts?.batchSize ?? 500;
  const startMs = Date.now();
  logger.info('[assessment] starting intake assessment sweep');

  const result: AssessmentRunResult = {
    scanned: 0,
    passed: 0,
    ops_tracker: 0,
    by_reason: {},
  };

  // Loop batches until no more intake rows remain. Each row's status flips out
  // of 'intake' on assessment, so the same query naturally advances.
  for (;;) {
    const { rows } = await pool.query<IntakeRow>(INTAKE_SELECT, [batchSize]);
    if (rows.length === 0) break;

    for (const row of rows) {
      const decision = await assessAndPersist(row);
      result.scanned++;
      if (decision.status === 'pass') result.passed++;
      else result.ops_tracker++;
      result.by_reason[decision.reason_code] = (result.by_reason[decision.reason_code] ?? 0) + 1;
    }

    if (rows.length < batchSize) break;
  }

  const durationMs = Date.now() - startMs;
  logger.info({ ...result, durationMs }, '[assessment] intake assessment sweep completed');
  return result;
}
