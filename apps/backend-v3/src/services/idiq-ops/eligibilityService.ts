/**
 * Eligibility Service — computes whether Envision can bid on a given TO.
 *
 * envision_eligible = (
 *   envision_holds_vehicle(vehicle_id)
 *   AND (set_aside IS NULL OR envision_qualifies(set_aside))
 *   AND (pool_or_lane IS NULL OR envision_holds_pool(vehicle_id, pool_or_lane))
 *   AND (naics_code IS NULL OR naics_code IN envision's NAICS allowlist)
 * )
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

interface EligibilityResult {
  eligible: boolean;
  reason: string;
}

interface VehicleData {
  id: number;
  short_name: string;
  naics_codes: string[] | null;
  pools_held: string[] | null;
  set_asides_held: string[] | null;
}

/** Envision's known set-aside qualifications */
const ENVISION_SET_ASIDES = ['SB', 'SDB', '8(a)', 'Minority-Owned'];

/**
 * Compute eligibility for a task order.
 */
export async function computeEligibility(
  vehicleId: number,
  setAside: string | null,
  poolOrLane: string | null,
  naicsCode: string | null,
): Promise<EligibilityResult> {
  const vResult = await pool.query<VehicleData>(
    `SELECT id, short_name, naics_codes, pools_held, set_asides_held
     FROM contract_vehicles WHERE id = $1 AND is_active = true`,
    [vehicleId],
  );

  if (vResult.rows.length === 0) {
    return { eligible: false, reason: 'Vehicle not found or inactive' };
  }

  const vehicle = vResult.rows[0];
  const reasons: string[] = [];
  let eligible = true;

  // Check set-aside eligibility
  if (setAside && setAside !== 'UR' && setAside !== 'Unrestricted') {
    const qualifies = vehicle.set_asides_held?.some(
      (sa) => sa.toLowerCase() === setAside.toLowerCase() ||
              ENVISION_SET_ASIDES.some((e) => e.toLowerCase() === setAside.toLowerCase()),
    );
    if (!qualifies) {
      eligible = false;
      reasons.push(`Not eligible for ${setAside} set-aside`);
    } else {
      reasons.push(`${setAside} qualified`);
    }
  } else if (setAside === 'UR' || setAside === 'Unrestricted') {
    reasons.push('Unrestricted — open to all holders');
  }

  // Check pool eligibility
  if (poolOrLane) {
    const holdsPool = vehicle.pools_held?.some(
      (p) => p.toLowerCase().includes(poolOrLane.toLowerCase()) ||
             poolOrLane.toLowerCase().includes(p.toLowerCase()),
    );
    if (!holdsPool) {
      eligible = false;
      reasons.push(`Not in pool: ${poolOrLane}`);
    } else {
      reasons.push(`${poolOrLane} holder`);
    }
  }

  // Check NAICS code
  if (naicsCode) {
    const naicsMatch = vehicle.naics_codes?.includes(naicsCode);
    if (!naicsMatch) {
      eligible = false;
      reasons.push(`NAICS ${naicsCode} not on vehicle`);
    } else {
      reasons.push(`NAICS ${naicsCode} match`);
    }
  }

  if (eligible && reasons.length === 0) {
    reasons.push(`${vehicle.short_name} holder`);
  }

  const prefix = eligible ? 'Eligible' : 'Not eligible';
  const reason = `${prefix} — ${reasons.join(', ')}`;

  return { eligible, reason };
}

/**
 * Compute wheelhouse score (0..1) for a given TO.
 * Per #878 scoring:
 *   NAICS in allowlist → +0.4
 *   Agency in allowlist → +0.3
 *   Dollar in band → +0.2
 *   Set-aside we pursue → +0.1
 */
export function computeWheelhouseScore(
  naicsCode: string | null,
  agency: string | null,
  estValueUsd: number | null,
  setAside: string | null,
  vehicleNaicsCodes: string[] | null,
): number {
  let score = 0;

  // NAICS in allowlist
  if (naicsCode && vehicleNaicsCodes?.includes(naicsCode)) {
    score += 0.4;
  }

  // Agency match — Envision's core customer agencies
  const coreAgencies = ['Army', 'Navy', 'USMC', 'DHS', 'USCG', 'VA', 'GSA', 'MDA', 'FAA', 'FEMA'];
  if (agency && coreAgencies.some((a) => agency.toLowerCase().includes(a.toLowerCase()))) {
    score += 0.3;
  }

  // Dollar band ($500K–$50M sweet spot)
  if (estValueUsd != null && estValueUsd >= 500_000 && estValueUsd <= 50_000_000) {
    score += 0.2;
  }

  // Set-aside we pursue
  if (setAside) {
    const pursueSetAsides = ['SB', 'SDB', '8(a)', 'Minority-Owned', 'UR', 'Unrestricted'];
    if (pursueSetAsides.some((s) => s.toLowerCase() === setAside.toLowerCase())) {
      score += 0.1;
    }
  }

  return Math.min(score, 1.0);
}

/**
 * Determine heat tier for a TO.
 * hot: eligible + closing ≤7 days + wheelhouse ≥0.7
 * eligible: eligible for bid
 * watch: uncertain eligibility or closing far out
 * not_eligible: cannot bid
 */
export function computeHeatTier(
  eligible: boolean,
  daysLeft: number | null,
  wheelhouseScore: number,
): 'hot' | 'eligible' | 'watch' | 'not_eligible' {
  if (!eligible) return 'not_eligible';
  if (daysLeft != null && daysLeft <= 7 && wheelhouseScore >= 0.7) return 'hot';
  if (eligible) return 'eligible';
  return 'watch';
}

/**
 * Batch-compute eligibility and heat for all open TOs missing eligibility.
 */
export async function batchComputeEligibility(): Promise<number> {
  const result = await pool.query(`
    SELECT toa.id, toa.vehicle_id, toa.set_aside, toa.pool_or_lane, toa.naics_code,
           toa.agency, toa.est_value_usd, toa.response_due,
           cv.naics_codes AS vehicle_naics_codes
    FROM task_order_announcements toa
    JOIN contract_vehicles cv ON cv.id = toa.vehicle_id
    WHERE toa.status = 'open' AND toa.envision_eligible IS NULL
  `);

  let updated = 0;
  for (const row of result.rows) {
    const eligibility = await computeEligibility(
      row.vehicle_id, row.set_aside, row.pool_or_lane, row.naics_code,
    );

    const daysLeft = row.response_due
      ? Math.ceil((new Date(row.response_due).getTime() - Date.now()) / 86_400_000)
      : null;

    const wheelhouseScore = computeWheelhouseScore(
      row.naics_code, row.agency, row.est_value_usd,
      row.set_aside, row.vehicle_naics_codes,
    );

    const heatTier = computeHeatTier(eligibility.eligible, daysLeft, wheelhouseScore);

    await pool.query(`
      UPDATE task_order_announcements
      SET envision_eligible = $1, eligibility_reason = $2,
          wheelhouse_score = $3, heat_tier = $4
      WHERE id = $5
    `, [eligibility.eligible, eligibility.reason, wheelhouseScore, heatTier, row.id]);

    updated++;
  }

  if (updated > 0) {
    logger.info({ updated }, '[idiq-ops] batch eligibility computation complete');
  }
  return updated;
}
