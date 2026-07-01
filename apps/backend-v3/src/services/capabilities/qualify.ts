/**
 * Qualification gate — determines if an opportunity qualifies for Envision pipeline.
 *
 * Hard rules (from F-306 spec):
 * 1. OU3 catalog is the only qualification gate — OU1/OU2 are teaming context only.
 * 2. A pursuit cannot be qualified if zero OU3 capabilities score >= 0.5.
 * 3. C-graded capabilities cannot be the sole basis for qualification.
 * 4. Auto-disqualify on F-303 exclusion hit, regardless of capability score.
 */

import { pool } from '../../lib/db.js';
import { getOpportunityCapabilityMatches, computeCapabilityMatches } from './matching.js';
import type { CapabilityMatch } from './matching.js';

export interface QualificationResult {
  qualified: boolean;
  recommendation: 'qualify' | 'disqualify';
  reasons: string[];
  top_matches: CapabilityMatch[];
  teaming_matches: CapabilityMatch[];
  doctrine_blocked: boolean;
  doctrine_exclusions: string[];
  best_envision_score: number;
  qualifying_capabilities_count: number;
}

const QUALIFY_THRESHOLD = 0.5;

export async function checkQualification(opportunityId: string): Promise<QualificationResult> {
  // Get or compute matches
  let matches = await getOpportunityCapabilityMatches(opportunityId);
  if (matches.length === 0) {
    matches = await computeCapabilityMatches(opportunityId);
  }

  // Separate Envision (OU3) from teaming context (OU1/OU2)
  const envisionMatches = matches.filter((m) => m.capability_ou === 'envision');
  const teamingMatches = matches.filter((m) => m.capability_ou !== 'envision');

  // Check F-303 doctrine exclusions
  const exclusionRes = await pool.query<{ triggered: boolean; name: string }>(
    `SELECT de.triggered, ds.name
     FROM doctrine_evaluations de
     CROSS JOIN LATERAL jsonb_to_recordset(de.exclusion_triggers) AS ds(id text, name text, triggered boolean, evidence text[])
     WHERE de.entity_kind = 'opportunity'
       AND de.entity_id = $1
       AND de.triggered = true
     ORDER BY de.evaluated_at DESC
     LIMIT 1`,
    [opportunityId],
  ).catch(() => ({ rows: [] as Array<{ triggered: boolean; name: string }> }));

  const doctrineExclusions = exclusionRes.rows
    .filter((r) => r.triggered)
    .map((r) => r.name);
  const doctrineBlocked = doctrineExclusions.length > 0;

  // Qualification logic
  const qualifyingEnvision = envisionMatches.filter((m) => m.match_score >= QUALIFY_THRESHOLD);
  const bestEnvisionScore = envisionMatches.length > 0
    ? Math.max(...envisionMatches.map((m) => m.match_score))
    : 0;

  const reasons: string[] = [];
  let qualified = false;

  // Rule 4: Auto-disqualify on exclusion hit
  if (doctrineBlocked) {
    reasons.push(`Disqualified: F-303 strategic exclusion triggered (${doctrineExclusions.join(', ')})`);
    qualified = false;
  }
  // Rule 2: Must have at least one OU3 capability >= 0.5
  else if (qualifyingEnvision.length === 0) {
    reasons.push(`Disqualified: No Envision capability scores >= ${QUALIFY_THRESHOLD}`);
    if (envisionMatches.length > 0) {
      reasons.push(`Best Envision match: ${envisionMatches[0]!.capability_name} (${envisionMatches[0]!.match_score})`);
    }
    qualified = false;
  }
  // Rule 3: C-graded can't be sole basis
  else {
    const nonCQualifying = qualifyingEnvision.filter((m) => m.evidence_grade !== 'C');
    if (nonCQualifying.length === 0 && qualifyingEnvision.every((m) => m.evidence_grade === 'C')) {
      reasons.push('Disqualified: All qualifying capabilities are evidence-grade C (insufficient evidence)');
      qualified = false;
    } else {
      qualified = true;
      reasons.push(`Qualified: ${qualifyingEnvision.length} Envision capability match(es) >= ${QUALIFY_THRESHOLD}`);
      for (const m of qualifyingEnvision.slice(0, 3)) {
        reasons.push(`  ${m.capability_name}: ${m.match_score} (grade ${m.evidence_grade ?? 'ungraded'})`);
      }
    }
  }

  // Teaming context
  if (teamingMatches.length > 0) {
    const strongTeaming = teamingMatches.filter((m) => m.match_score >= QUALIFY_THRESHOLD);
    if (strongTeaming.length > 0) {
      reasons.push(`Teaming context: ${strongTeaming.length} partner capability match(es) available`);
    }
  }

  return {
    qualified,
    recommendation: qualified ? 'qualify' : 'disqualify',
    reasons,
    top_matches: envisionMatches.slice(0, 5),
    teaming_matches: teamingMatches.slice(0, 5),
    doctrine_blocked: doctrineBlocked,
    doctrine_exclusions: doctrineExclusions,
    best_envision_score: bestEnvisionScore,
    qualifying_capabilities_count: qualifyingEnvision.length,
  };
}
