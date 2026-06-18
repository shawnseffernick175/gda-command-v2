/**
 * Pwin computation — single source of truth (F-868, closes #849).
 *
 * Pwin is computed from Shipley capture drivers + completed color review impacts.
 * Returns null (unforecastable) if any of the 3 required driver scores is missing.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

interface CapturePlanRow {
  customer_relationship_score: number | null;
  solution_fit_score: number | null;
  competitive_position_score: number | null;
  customer_budget_confirmed: boolean;
  prime_or_sub: string | null;
  margin_target: number | null;
  ptw_estimate: number | null;
}

interface ReviewImpactRow {
  pwin_impact: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function computePwin(captureId: number): Promise<number | null> {
  const planRes = await pool.query<CapturePlanRow>(
    `SELECT customer_relationship_score, solution_fit_score, competitive_position_score,
            customer_budget_confirmed, prime_or_sub, margin_target, ptw_estimate
     FROM capture_plans WHERE capture_id = $1`,
    [captureId]
  );

  const plan = planRes.rows[0];
  if (!plan) return null;

  const drivers = [
    plan.customer_relationship_score,
    plan.solution_fit_score,
    plan.competitive_position_score,
  ];

  if (drivers.some((d) => d === null || d === undefined)) {
    return null;
  }

  const driverSum = (drivers as number[]).reduce((sum, d) => sum + d, 0);
  let base = driverSum / (drivers.length * 5);

  if (plan.customer_budget_confirmed) {
    base += 0.05;
  }

  if (plan.prime_or_sub === 'PRIME' && (plan.customer_relationship_score ?? 0) >= 4) {
    base += 0.03;
  }

  if (plan.margin_target !== null && plan.margin_target < 0.08) {
    base -= 0.10;
  }

  // Get estimated value from pipeline chain for PTW check
  const valRes = await pool.query<{ estimated_value: number | null }>(
    `SELECT pi.estimated_value FROM captures c
     JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
     WHERE c.id = $1`,
    [captureId]
  );
  const estimatedValue = valRes.rows[0]?.estimated_value;

  if (
    plan.ptw_estimate !== null &&
    estimatedValue !== null &&
    estimatedValue !== undefined &&
    plan.ptw_estimate < estimatedValue * 0.85
  ) {
    base -= 0.05;
  }

  // Reviews modulate Pwin
  const reviewRes = await pool.query<ReviewImpactRow>(
    `SELECT pwin_impact FROM color_reviews WHERE capture_id = $1 AND status = 'complete' AND pwin_impact IS NOT NULL`,
    [captureId]
  );

  for (const r of reviewRes.rows) {
    if (r.pwin_impact !== null) {
      base += r.pwin_impact;
    }
  }

  const finalPwin = clamp(base, 0.0, 0.95);

  // Persist computed value
  await pool.query(
    `UPDATE capture_plans SET computed_pwin = $1, pwin_last_computed_at = NOW(), updated_at = NOW()
     WHERE capture_id = $2`,
    [finalPwin, captureId]
  );

  logger.info({ captureId, pwin: finalPwin }, 'Pwin recomputed');
  return finalPwin;
}

/**
 * Maps overall color rating to Pwin impact percentage.
 */
export function colorRatingToPwinImpact(rating: string): number {
  switch (rating) {
    case 'Blue': return 0.10;
    case 'Green': return 0.05;
    case 'Yellow': return 0.00;
    case 'Red': return -0.10;
    case 'Pink': return -0.20;
    default: return 0.00;
  }
}

/**
 * Computes overall color rating from section scores (weighted or equal-weight).
 */
export function computeOverallRating(
  sections: Array<{ score: number | null; weight_pct: number | null }>
): { rating: string; score: number } {
  const scored = sections.filter((s) => s.score !== null);
  if (scored.length === 0) return { rating: 'Yellow', score: 0 };

  const hasWeights = scored.some((s) => s.weight_pct !== null && s.weight_pct > 0);

  let weightedScore: number;
  if (hasWeights) {
    const totalWeight = scored.reduce((sum, s) => sum + (s.weight_pct ?? 1), 0);
    weightedScore = scored.reduce(
      (sum, s) => sum + ((s.score as number) * (s.weight_pct ?? 1)) / totalWeight,
      0
    );
  } else {
    weightedScore = scored.reduce((sum, s) => sum + (s.score as number), 0) / scored.length;
  }

  let rating: string;
  if (weightedScore >= 4.5) rating = 'Blue';
  else if (weightedScore >= 3.5) rating = 'Green';
  else if (weightedScore >= 2.5) rating = 'Yellow';
  else if (weightedScore >= 1.5) rating = 'Red';
  else rating = 'Pink';

  return { rating, score: Math.round(weightedScore * 100) / 100 };
}
