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

export const DEFAULT_PWIN_WEIGHTS: PwinWeights = {
  base: 30,
  incumbency_bonus: 30,
  recompete_bonus: 8,
  capability_match_multiplier: 0.3,
  vehicle_access: 10,
  clearance_fit: 5,
  doctrine_bonus_max: 10,
  margin_penalty: -20,
  teaming_bonus: 5,
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
