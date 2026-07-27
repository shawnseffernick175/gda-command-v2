/**
 * F-453 — Pwin weight config helper.
 *
 * Reads from pwin_scoring_config table (config_key = 'default').
 * Falls back to DEFAULT_PWIN_WEIGHTS if table/row missing.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

export interface PwinWeights {
  base?: number;
  incumbency_bonus?: number;
  recompete_bonus?: number;
  capability_match_multiplier?: number;
  vehicle_access?: number;
  clearance_fit?: number;
  doctrine_bonus_max?: number;
  margin_penalty?: number;
  teaming_bonus?: number;
  teaming_penalty?: number;
  naics_small_setaside?: number;
  naics_small_fullopen?: number;
  existing_customer?: number;
}

/**
 * Default rules-scorer weights.
 *
 * NOTE — currently-inert levers. The production feature-extraction path
 * (`feature-extraction.ts`) hardcodes the features these two weights depend on,
 * so they never actually move a score today:
 *   - `margin_penalty`  — gated on `below_margin_floor`, which is always `false`
 *     (no per-opportunity margin data is extracted). Never applied.
 *   - `teaming_bonus`   — gated on `candidate_partners.length >= 1`, but
 *     `candidate_partners` is always `[]`, so a teaming-required set-aside can
 *     only ever take the `teaming_penalty`. The bonus is never applied.
 * They are retained (not deleted) because the scorer implements them correctly
 * and they activate the moment those features are populated. Do not read them
 * as active tuning knobs until the driving features are wired.
 */
export const DEFAULT_PWIN_WEIGHTS: PwinWeights = {
  base: 30,
  incumbency_bonus: 30,
  recompete_bonus: 8,
  capability_match_multiplier: 0.3,
  vehicle_access: 10,
  clearance_fit: 5,
  doctrine_bonus_max: 10,
  margin_penalty: -20, // inert: below_margin_floor never set (see note above)
  teaming_bonus: 5, // inert: candidate_partners never populated (see note above)
  teaming_penalty: -10,
  naics_small_setaside: 20,
  naics_small_fullopen: 10,
  existing_customer: 5,
};

export async function getPwinWeights(): Promise<PwinWeights> {
  try {
    const res = await pool.query<{ weights: PwinWeights }>(
      `SELECT weights FROM pwin_scoring_config WHERE config_key = 'default' LIMIT 1`,
    );
    if (res.rows.length > 0 && res.rows[0]) {
      return res.rows[0].weights;
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to read pwin_scoring_config — using defaults');
  }
  return { ...DEFAULT_PWIN_WEIGHTS };
}
