/**
 * Intake assessment rules — PURE decision logic, no DB access.
 *
 * Owner rule (binding): the AI does ASSESSMENT ONLY. It decides where an
 * opportunity sits in the intake funnel (pass vs. ops_tracker) but NEVER
 * inserts into the pipeline. Only the user promotes from the Ops Tracker.
 *
 * Rules are evaluated in strict order; the FIRST match wins:
 *   1. naics NULL                          -> pass (no_naics)
 *   2. naics NOT in ENVISION_NAICS         -> pass (out_of_naics)
 *   3. response_due_at < NOW() + 30 days   -> pass (deadline_lt_30d)
 *   4. commodity / product purchase        -> pass (commodity_purchase)
 *   5. low AI pWin / fit (band 'pass' or
 *      score below LOW_PWIN_THRESHOLD)      -> pass (low_pwin)
 *   6. otherwise                            -> ops_tracker (in_naics_good_fit)
 */

import { ENVISION_NAICS } from '../../constants/envision-naics.js';

export type AssessmentStatus = 'pass' | 'ops_tracker';

export type AssessmentReasonCode =
  | 'no_naics'
  | 'out_of_naics'
  | 'deadline_lt_30d'
  | 'commodity_purchase'
  | 'low_pwin'
  | 'in_naics_good_fit';

export interface AssessmentDecision {
  status: AssessmentStatus;
  reason_code: AssessmentReasonCode;
  /** Human-readable reason stamped into assessment_reason, e.g. 'pass: out_of_naics'. */
  reason: string;
  /** AI pWin/fit score (0–100) for ranking survivors; null for passes. */
  score: number | null;
}

/** Minimum days of lead time before an opportunity is too late to capture. */
export const ASSESSMENT_DEADLINE_DAYS = 30;

/**
 * Below this pWin/fit score a survivor is treated as a low-confidence pursuit
 * and passed. The deterministic scorer's 'signal' band starts at 45, so 45 is
 * the floor for something worth putting in front of the user.
 */
export const LOW_PWIN_THRESHOLD = 45;

const naicsSet = new Set<string>(ENVISION_NAICS);

export interface AssessmentInput {
  naics: string | null | undefined;
  response_due_at: string | Date | null | undefined;
  psc: string | null | undefined;
  opportunity_type?: string | null | undefined;
  part_number?: string | null | undefined;
  quantity?: number | string | null | undefined;
  /** AI pWin/fit band from the deterministic/LLM scorer. */
  pwin_band?: string | null | undefined;
  /** AI pWin/fit numeric score (0–100). */
  pwin_score?: number | null | undefined;
}

/**
 * Determine whether a PSC code denotes a product/commodity purchase rather than
 * a service. Federal PSC convention: a LEADING DIGIT means a product/commodity;
 * a LEADING ALPHA means a service (e.g. 'R', 'D', 'A'). Empty/unknown → not a
 * product (don't pass on missing data alone).
 */
export function isProductPsc(psc: string | null | undefined): boolean {
  const code = psc?.trim();
  if (!code) return false;
  return /^[0-9]/.test(code);
}

/**
 * Commodity/product detection: product PSC code, OR explicit product signals
 * on the row (part_number present, a positive quantity, or an opportunity_type
 * that reads as a product/supply/commodity buy).
 */
export function isCommodityPurchase(input: AssessmentInput): boolean {
  if (isProductPsc(input.psc)) return true;

  if (input.part_number && String(input.part_number).trim().length > 0) return true;

  if (input.quantity != null) {
    const qty = typeof input.quantity === 'string' ? Number(input.quantity) : input.quantity;
    if (!Number.isNaN(qty) && qty > 0) return true;
  }

  const type = input.opportunity_type?.toLowerCase().trim();
  if (type && /(product|supply|supplies|commodit|goods|equipment|hardware|part)/.test(type)) {
    return true;
  }

  return false;
}

function daysUntil(due: string | Date | null | undefined, now: Date): number | null {
  if (!due) return null;
  const ms = (due instanceof Date ? due : new Date(due)).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor((ms - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Evaluate the assessment rules for a single opportunity. Pure: caller supplies
 * the AI pwin band/score (computed once upstream) and the current time.
 */
export function assessOpportunity(input: AssessmentInput, now: Date = new Date()): AssessmentDecision {
  // 1. No NAICS
  const naics = input.naics?.trim() || null;
  if (!naics) {
    return { status: 'pass', reason_code: 'no_naics', reason: 'pass: no_naics', score: null };
  }

  // 2. Out of profile
  if (!naicsSet.has(naics)) {
    return {
      status: 'pass',
      reason_code: 'out_of_naics',
      reason: `pass: out_of_naics (${naics})`,
      score: null,
    };
  }

  // 3. Deadline too close (within threshold or already past)
  const days = daysUntil(input.response_due_at, now);
  if (days !== null && days < ASSESSMENT_DEADLINE_DAYS) {
    return {
      status: 'pass',
      reason_code: 'deadline_lt_30d',
      reason: `pass: deadline_lt_30d (${days}d)`,
      score: null,
    };
  }

  // 4. Commodity / product purchase
  if (isCommodityPurchase(input)) {
    return {
      status: 'pass',
      reason_code: 'commodity_purchase',
      reason: 'pass: commodity_purchase',
      score: null,
    };
  }

  // 5. Low AI pWin / fit
  const band = input.pwin_band?.toLowerCase() ?? null;
  const score = typeof input.pwin_score === 'number' ? input.pwin_score : null;
  const lowByBand = band === 'pass';
  const lowByScore = score !== null && score < LOW_PWIN_THRESHOLD;
  if (lowByBand || lowByScore) {
    return {
      status: 'pass',
      reason_code: 'low_pwin',
      reason: `pass: low_pwin${score !== null ? ` (${score})` : ''}`,
      score,
    };
  }

  // 6. Survivor → Ops Tracker, ranked by score.
  return {
    status: 'ops_tracker',
    reason_code: 'in_naics_good_fit',
    reason: `ops_tracker: in_naics_good_fit${score !== null ? ` (${score})` : ''}`,
    score,
  };
}
