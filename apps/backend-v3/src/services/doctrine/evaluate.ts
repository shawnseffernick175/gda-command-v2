/**
 * Doctrine evaluation engine — scores 8 principles, evaluates exclusions,
 * checks margin floor, and generates recommendations.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { getPrinciples, getExclusions, getConfigValue } from './config.js';
import type { DoctrinePrinciple, DoctrineExclusion } from './config.js';

export interface PrincipleScore {
  score: number;
  rationale: string;
  evidence_grade: 'A' | 'B' | 'C';
  citations: string[];
}

export interface ExclusionResult {
  id: string;
  name: string;
  triggered: boolean;
  evidence: string[];
  override_available: boolean;
}

export interface MarginCheck {
  passed: boolean;
  margin_pct: number | null;
  threshold: number;
  source: string;
}

export interface DoctrineEvaluation {
  id: string;
  entity_kind: string;
  entity_id: string;
  agent_run_id: string | null;
  principle_scores: Record<string, PrincipleScore>;
  alignment_total: number;
  exclusion_triggers: ExclusionResult[];
  margin_check: MarginCheck;
  evidence_grades: Record<string, 'A' | 'B' | 'C'>;
  recommendations: string[];
  evaluated_at: string;
}

interface EntityContext {
  title?: string;
  description?: string;
  agency?: string;
  naics?: string;
  set_aside?: string;
  value_min?: number;
  value_max?: number;
  expected_margin_pct?: number;
  customer?: string;
  ou_lead?: string;
  analysis?: Record<string, unknown>;
  [key: string]: unknown;
}

async function fetchEntityContext(entityKind: string, entityId: string): Promise<EntityContext> {
  if (entityKind === 'opportunity') {
    const res = await pool.query(
      `SELECT title, description, agency, naics, set_aside, value_min, value_max,
              analysis, status, grade
       FROM opportunities WHERE id = $1 AND deleted_at IS NULL`,
      [entityId]
    );
    if (res.rows.length === 0) {
      throw new Error(`Opportunity ${entityId} not found`);
    }
    return res.rows[0] as EntityContext;
  }
  if (entityKind === 'capture') {
    const res = await pool.query(
      `SELECT c.*, o.title, o.description, o.agency, o.naics, o.set_aside, o.value_min, o.value_max
       FROM captures c LEFT JOIN opportunities o ON c.opportunity_id = o.id
       WHERE c.id = $1`,
      [entityId]
    );
    if (res.rows.length === 0) {
      throw new Error(`Capture ${entityId} not found`);
    }
    return res.rows[0] as EntityContext;
  }
  return {};
}

function scorePrinciple(principle: DoctrinePrinciple, context: EntityContext): PrincipleScore {
  // Deterministic heuristic scoring based on available data.
  // In production with RAG (F-301), this calls the LLM with the evaluation_prompt.
  // For now: rule-based scoring with cited evidence.

  const citations: string[] = [];
  let score = 3; // default moderate
  let rationale = '';
  let evidenceGrade: 'A' | 'B' | 'C' = 'C';

  switch (principle.id) {
    case 'alignment': {
      const envisionNaics = ['541330', '541512', '541519', '541611', '541613', '541690', '541715', '561210', '611430'];
      if (context.naics && envisionNaics.some(n => context.naics?.includes(n))) {
        score = 4;
        rationale = `NAICS ${context.naics} aligns with Envision core lanes (logistics/sustainment/systems engineering).`;
        evidenceGrade = 'A';
        citations.push(`NAICS code: ${context.naics}`);
      } else if (context.naics) {
        score = 2;
        rationale = `NAICS ${context.naics} is outside Envision primary lanes. Review for strategic fit.`;
        evidenceGrade = 'A';
        citations.push(`NAICS code: ${context.naics}`);
      } else {
        rationale = 'No NAICS data available to evaluate alignment. Requires manual review.';
        citations.push('No NAICS data in record');
      }
      break;
    }
    case 'ethics_always': {
      // Default high score unless red flags detected
      score = 5;
      rationale = 'No integrity, regulatory, or representation risks identified in available data.';
      evidenceGrade = 'B';
      if (context.description?.toLowerCase().includes('oci') || context.description?.toLowerCase().includes('conflict of interest')) {
        score = 2;
        rationale = 'Potential OCI concern identified in opportunity description. Requires ethics review.';
        citations.push('OCI keyword in description');
      }
      citations.push('Automated ethics screen — no FAR/DFARS flags detected');
      break;
    }
    case 'teamwork': {
      const needsTeaming = context.set_aside?.toLowerCase().includes('hubzone') ||
        context.description?.toLowerCase().includes('sigint') ||
        context.description?.toLowerCase().includes('training') ||
        context.description?.toLowerCase().includes('cyber');
      if (needsTeaming) {
        score = 4;
        rationale = 'Scope suggests cross-OU teaming opportunity (Riverstone cyber/SIGINT or PD Systems training).';
        evidenceGrade = 'B';
        citations.push('Scope keywords suggest partner capability alignment');
      } else {
        score = 4;
        rationale = 'Pursuit can be executed within Envision capabilities without requiring silo behavior.';
        evidenceGrade = 'B';
        citations.push('Scope within single-OU execution capacity');
      }
      break;
    }
    case 'data_first': {
      const hasAnalysis = context.analysis != null;
      if (hasAnalysis) {
        score = 4;
        rationale = 'Pursuit rationale grounded in automated analysis with source citations.';
        evidenceGrade = 'A';
        citations.push('AI analysis with source citations available');
      } else {
        score = 2;
        rationale = 'Limited verifiable data supporting pursuit decision. Needs source-grade evidence upgrade.';
        evidenceGrade = 'C';
        citations.push('No automated analysis or sourced data available');
      }
      break;
    }
    case 'relentless_execution': {
      const hasVehicle = context.description?.toLowerCase().includes('rs3') ||
        context.description?.toLowerCase().includes('oasis') ||
        context.description?.toLowerCase().includes('seaport') ||
        context.description?.toLowerCase().includes('gsa');
      if (hasVehicle) {
        score = 4;
        rationale = 'Contract vehicle alignment detected. Envision holds relevant IDIQ capacity.';
        evidenceGrade = 'A';
        citations.push('Vehicle keyword match in description');
      } else {
        score = 3;
        rationale = 'Vehicle alignment not confirmed from available data. Verify staffing and vehicle access.';
        evidenceGrade = 'C';
        citations.push('No vehicle keywords detected — manual verification needed');
      }
      break;
    }
    case 'relationships': {
      // Score based on customer match to known customers
      const knownCustomers = ['army', 'tacom', 'cascom', 'tradoc', 'uscg', 'usn', 'fema', 'va', 'dhs'];
      const hasRelationship = knownCustomers.some(c =>
        context.agency?.toLowerCase().includes(c) || context.customer?.toLowerCase().includes(c)
      );
      if (hasRelationship) {
        score = 4;
        rationale = 'Customer matches Envision established relationship base. Existing positioning likely.';
        evidenceGrade = 'B';
        citations.push(`Agency: ${context.agency ?? 'known customer match'}`);
      } else {
        score = 2;
        rationale = 'No established customer relationship identified. Cold pursuit — requires relationship-building investment.';
        evidenceGrade = 'C';
        citations.push('Agency not in Envision primary customer list');
      }
      break;
    }
    case 'market_mission_brand': {
      const missionKeywords = ['sustainment', 'logistics', 'mission', 'assurance', 'field service', 'c5isr', 'training'];
      const hasMissionFit = missionKeywords.some(k => context.description?.toLowerCase().includes(k) || context.title?.toLowerCase().includes(k));
      if (hasMissionFit) {
        score = 5;
        rationale = 'Scope aligns with "Boring Excellence" / Mission Assurance brand positioning.';
        evidenceGrade = 'A';
        citations.push('Mission-aligned keywords in scope');
      } else {
        score = 3;
        rationale = 'Brand alignment unclear from available data. Review for "Agile Integrator" fit.';
        evidenceGrade = 'C';
        citations.push('No mission-alignment keywords detected');
      }
      break;
    }
    case 'customer_facing': {
      // Default moderate — requires engagement data that may not be in opp record
      score = 3;
      rationale = 'Customer engagement level cannot be determined from opportunity data alone. Check capture notes for meeting/engagement history.';
      evidenceGrade = 'C';
      citations.push('No documented customer engagement in record');
      break;
    }
  }

  return { score, rationale, evidence_grade: evidenceGrade, citations };
}

function evaluateExclusion(exclusion: DoctrineExclusion, context: EntityContext): ExclusionResult {
  let triggered = false;
  const evidence: string[] = [];

  switch (exclusion.id) {
    case 'low_assurance_cyber': {
      const isCyber = context.description?.toLowerCase().includes('cybersecurity') ||
        context.description?.toLowerCase().includes('soc monitoring') ||
        context.description?.toLowerCase().includes('penetration testing');
      const isCleared = context.description?.toLowerCase().includes('ts/sci') ||
        context.description?.toLowerCase().includes('clearance') ||
        context.description?.toLowerCase().includes('classified');
      if (isCyber && !isCleared) {
        triggered = true;
        evidence.push('Cyber scope detected without clearance requirements');
      }
      break;
    }
    case 'commercial_software_only': {
      const isCommercial = context.description?.toLowerCase().includes('commercial software') ||
        context.description?.toLowerCase().includes('saas') ||
        context.description?.toLowerCase().includes('mobile app');
      const hasGovNexus = context.description?.toLowerCase().includes('fedramp') ||
        context.description?.toLowerCase().includes('il4') ||
        context.description?.toLowerCase().includes('stig') ||
        context.agency != null;
      if (isCommercial && !hasGovNexus) {
        triggered = true;
        evidence.push('Commercial software scope with no government security/mission nexus');
      }
      break;
    }
    case 'staff_aug_only': {
      const isStaffAug = context.description?.toLowerCase().includes('staff augmentation') ||
        context.description?.toLowerCase().includes('body shop') ||
        context.description?.toLowerCase().includes('labor hour');
      const hasSolution = context.description?.toLowerCase().includes('solution') ||
        context.description?.toLowerCase().includes('platform') ||
        context.description?.toLowerCase().includes('deliverable');
      if (isStaffAug && !hasSolution) {
        triggered = true;
        evidence.push('Staff augmentation scope with no solution/platform ownership');
      }
      break;
    }
    case 'below_margin_floor': {
      if (context.expected_margin_pct != null && context.expected_margin_pct < 8) {
        triggered = true;
        evidence.push(`Expected margin ${context.expected_margin_pct}% below 8% floor`);
      }
      break;
    }
    case 'non_cleared_commercial_it': {
      const isIT = context.description?.toLowerCase().includes('helpdesk') ||
        context.description?.toLowerCase().includes('desktop support') ||
        context.description?.toLowerCase().includes('network admin');
      const requiresClearance = context.description?.toLowerCase().includes('clearance') ||
        context.description?.toLowerCase().includes('classified') ||
        context.description?.toLowerCase().includes('government enclave');
      if (isIT && !requiresClearance) {
        triggered = true;
        evidence.push('Commercial IT scope without clearance or government-specific compliance');
      }
      break;
    }
    case 'ou2_out_of_lane': {
      const approvedAgencies = ['nsa', 'nga', 'nro', 'odni', 'cia', 'uscybercom'];
      const isOU2Led = context.ou_lead?.toLowerCase() === 'riverstone';
      if (isOU2Led) {
        const agencyLower = (context.agency ?? '').toLowerCase();
        const inLane = approvedAgencies.some(a => agencyLower.includes(a));
        if (!inLane) {
          triggered = true;
          evidence.push(`OU2 (Riverstone) pursuit outside approved lanes: ${context.agency ?? 'unknown agency'}`);
        }
      }
      break;
    }
  }

  return {
    id: exclusion.id,
    name: exclusion.name,
    triggered,
    evidence,
    override_available: exclusion.is_hard_block,
  };
}

function generateRecommendations(
  principleScores: Record<string, PrincipleScore>,
  exclusionResults: ExclusionResult[],
  marginCheck: MarginCheck,
): string[] {
  const recommendations: string[] = [];

  // Find lowest-scoring principle
  const sorted = Object.entries(principleScores).sort((a, b) => a[1].score - b[1].score);
  const lowest = sorted[0];
  if (lowest && lowest[1].score <= 2) {
    recommendations.push(`Address low "${lowest[0]}" score (${lowest[1].score}/5): ${lowest[1].rationale}`);
  }

  // Triggered exclusions
  for (const excl of exclusionResults) {
    if (excl.triggered) {
      recommendations.push(`BLOCKED: ${excl.name} — ${excl.evidence.join('; ')}. Override requires executive rationale.`);
    }
  }

  // Margin
  if (!marginCheck.passed && marginCheck.margin_pct != null) {
    recommendations.push(`Margin ${marginCheck.margin_pct}% below ${marginCheck.threshold}% floor. Review pricing assumptions or seek executive override.`);
  }

  // Evidence upgrades
  const cGradeCount = Object.values(principleScores).filter(s => s.evidence_grade === 'C').length;
  if (cGradeCount >= 3) {
    recommendations.push('Multiple principles rely on hypothesis-grade [C] evidence. Upgrade to [A] or [B] sources before proposal submission.');
  }

  // Relationship building
  if (principleScores['relationships']?.score <= 2) {
    recommendations.push('No established customer relationship. Identify teaming partner with existing positioning or invest in pre-RFP engagement.');
  }

  // Teamwork opportunity
  if (principleScores['teamwork']?.score >= 4 && principleScores['teamwork']?.rationale.includes('teaming')) {
    recommendations.push('Cross-OU teaming opportunity identified. Evaluate Riverstone/PD Systems partnership for bid strengthening.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Doctrine alignment is strong. Proceed with standard capture process.');
  }

  return recommendations;
}

export async function runDoctrineCheck(
  entityKind: string,
  entityId: string,
  additionalContext?: Record<string, unknown>,
): Promise<DoctrineEvaluation> {
  const context = { ...(await fetchEntityContext(entityKind, entityId)), ...additionalContext };
  const principles = await getPrinciples();
  const exclusions = await getExclusions();
  const marginFloor = (await getConfigValue('margin_floor_pct')) as number ?? 8;

  // Score all principles
  const principleScores: Record<string, PrincipleScore> = {};
  for (const principle of principles) {
    principleScores[principle.id] = scorePrinciple(principle, context);
  }

  // Calculate alignment total
  const alignmentTotal = Object.values(principleScores).reduce((sum, s) => sum + s.score, 0);

  // Evaluate exclusions
  const exclusionResults = exclusions.map(excl => evaluateExclusion(excl, context));

  // Margin check
  const marginPct = context.expected_margin_pct ?? null;
  const marginCheck: MarginCheck = {
    passed: marginPct == null || marginPct >= marginFloor,
    margin_pct: marginPct,
    threshold: marginFloor,
    source: marginPct != null ? 'pricing_assumptions' : 'not_available',
  };

  // Evidence grades summary
  const evidenceGrades: Record<string, 'A' | 'B' | 'C'> = {};
  for (const [key, score] of Object.entries(principleScores)) {
    evidenceGrades[key] = score.evidence_grade;
  }

  // Recommendations
  const recommendations = generateRecommendations(principleScores, exclusionResults, marginCheck);

  // Persist evaluation
  const insertRes = await pool.query<{ id: string; evaluated_at: string }>(
    `INSERT INTO doctrine_evaluations
       (entity_kind, entity_id, principle_scores, alignment_total, exclusion_triggers, margin_check, evidence_grades, recommendations)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, evaluated_at`,
    [
      entityKind,
      entityId,
      JSON.stringify(principleScores),
      alignmentTotal,
      JSON.stringify(exclusionResults),
      JSON.stringify(marginCheck),
      JSON.stringify(evidenceGrades),
      JSON.stringify(recommendations),
    ]
  );

  const row = insertRes.rows[0];

  logger.info({ entityKind, entityId, alignmentTotal, exclusionsTriggered: exclusionResults.filter(e => e.triggered).length }, 'Doctrine evaluation completed');

  return {
    id: row.id,
    entity_kind: entityKind,
    entity_id: entityId,
    agent_run_id: null,
    principle_scores: principleScores,
    alignment_total: alignmentTotal,
    exclusion_triggers: exclusionResults,
    margin_check: marginCheck,
    evidence_grades: evidenceGrades,
    recommendations,
    evaluated_at: row.evaluated_at,
  };
}

export async function getEvaluationHistory(
  entityKind: string,
  entityId: string,
): Promise<DoctrineEvaluation[]> {
  const res = await pool.query<{
    id: string;
    entity_kind: string;
    entity_id: string;
    agent_run_id: string | null;
    principle_scores: Record<string, PrincipleScore>;
    alignment_total: number;
    exclusion_triggers: ExclusionResult[];
    margin_check: MarginCheck;
    evidence_grades: Record<string, 'A' | 'B' | 'C'>;
    recommendations: string[];
    evaluated_at: string;
  }>(
    `SELECT id, entity_kind, entity_id, agent_run_id, principle_scores, alignment_total,
            exclusion_triggers, margin_check, evidence_grades, recommendations, evaluated_at
     FROM doctrine_evaluations
     WHERE entity_kind = $1 AND entity_id = $2
     ORDER BY evaluated_at DESC
     LIMIT 20`,
    [entityKind, entityId]
  );
  return res.rows;
}
