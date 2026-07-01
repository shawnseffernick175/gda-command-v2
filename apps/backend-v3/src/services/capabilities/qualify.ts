/**
 * Qualification gate — checks capability matches + doctrine before allowing
 * an opportunity into the Envision pipeline (F-306).
 *
 * Hard rules:
 *   1. OU3 (Envision) catalog is the only qualification gate.
 *   2. A pursuit cannot be qualified if zero OU3 capabilities score >= 0.5.
 *   3. C-graded capabilities cannot be the sole basis for qualification.
 *   4. Auto-disqualify on any F-303 strategic exclusion trigger.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { getOpportunityCapabilityMatches, matchOpportunityCapabilities } from './matching.js';
import type { CapabilityMatch, QualifyResult } from './types.js';

const QUALIFY_THRESHOLD = 0.5;

export async function qualifyWithCapabilities(
  opportunityId: string,
): Promise<QualifyResult> {
  // Ensure matches are computed (run matching if needed)
  let matches = await getOpportunityCapabilityMatches(opportunityId);
  if (matches.length === 0) {
    matches = await matchOpportunityCapabilities(opportunityId);
  }

  // Filter to Envision-only capabilities above threshold
  const envisionMatches = matches.filter(
    (m) => m.capability?.ou === 'envision' && m.match_score >= QUALIFY_THRESHOLD,
  );

  // Check doctrine exclusions (F-303)
  const doctrineResult = await checkDoctrineExclusions(opportunityId);
  const doctrineBlocked = doctrineResult.blocked;
  const exclusionNames = doctrineResult.exclusions;

  // Rule 1+2: No Envision capability >= 0.5 → cannot qualify
  if (envisionMatches.length === 0) {
    return {
      qualified: false,
      reason: 'No Envision capability matches above the 0.5 threshold',
      top_matches: matches.slice(0, 5),
      doctrine_blocked: doctrineBlocked,
      doctrine_exclusions: exclusionNames,
      capability_blocked: true,
    };
  }

  // Rule 3: C-graded capabilities cannot be the sole basis
  const nonCMatches = envisionMatches.filter(
    (m) => m.capability?.evidence_grade !== 'C',
  );
  if (nonCMatches.length === 0) {
    return {
      qualified: false,
      reason: 'Only C-graded capabilities match — insufficient evidence for qualification',
      top_matches: matches.slice(0, 5),
      doctrine_blocked: doctrineBlocked,
      doctrine_exclusions: exclusionNames,
      capability_blocked: true,
    };
  }

  // Rule 4: Doctrine exclusion blocks qualification regardless of match
  if (doctrineBlocked) {
    return {
      qualified: false,
      reason: `Doctrine exclusion triggered: ${exclusionNames.join(', ')}`,
      top_matches: matches.slice(0, 5),
      doctrine_blocked: true,
      doctrine_exclusions: exclusionNames,
      capability_blocked: false,
    };
  }

  return {
    qualified: true,
    reason: `Qualified with ${envisionMatches.length} Envision capability match(es) above threshold`,
    top_matches: matches.slice(0, 5),
    doctrine_blocked: false,
    doctrine_exclusions: [],
    capability_blocked: false,
  };
}

async function checkDoctrineExclusions(
  opportunityId: string,
): Promise<{ blocked: boolean; exclusions: string[] }> {
  try {
    const res = await pool.query<{
      exclusion_triggers: Array<{ name: string; triggered: boolean }>;
    }>(
      `SELECT exclusion_triggers FROM doctrine_evaluations
       WHERE entity_kind = 'opportunity' AND entity_id = $1
       ORDER BY evaluated_at DESC LIMIT 1`,
      [opportunityId],
    );

    if (res.rows.length === 0) {
      return { blocked: false, exclusions: [] };
    }

    const triggers = res.rows[0]!.exclusion_triggers ?? [];
    const fired = triggers.filter((t) => t.triggered).map((t) => t.name);
    return { blocked: fired.length > 0, exclusions: fired };
  } catch (err) {
    logger.warn({ err, opportunityId }, 'Failed to check doctrine exclusions — allowing qualification');
    return { blocked: false, exclusions: [] };
  }
}
