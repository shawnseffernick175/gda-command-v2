/**
 * Risk service — F-307: Risks as First-Class Objects.
 *
 * Central service for creating/querying/deduplicating risks and logging risk events.
 */

import type pg from 'pg';
import { pool } from '../../lib/db.js';

/* ── Types ─────────────────────────────────────────────────── */

export type RiskCategory =
  | 'doctrine_violation' | 'margin' | 'compliance' | 'past_performance'
  | 'teaming' | 'incumbent_advantage' | 'schedule' | 'staffing'
  | 'certification' | 'price' | 'technical' | 'other'
  | 'operational' | 'financial' | 'competitive' | 'personnel';

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';
export type RiskStatus = 'open' | 'mitigating' | 'resolved' | 'accepted' | 'mitigated' | 'closed';
export type RiskSource = 'manual' | 'ai_generated' | 'doctrine_rule' | 'color_review' | 'sentinel' | 'hook';

export type RiskEventType =
  | 'created' | 'status_change' | 'duplicate_fire' | 'mitigation_update'
  | 'owner_change' | 'evidence_added' | 'severity_change' | 'note';

export interface CreateRiskInput {
  title: string;
  description: string;
  category: RiskCategory;
  severity: RiskSeverity;
  status?: RiskStatus;
  owner?: string | null;
  opportunity_id?: number | null;
  related_capture_id?: number | null;
  related_pipeline_item_id?: string | null;
  related_action_item_id?: string | null;
  source: RiskSource;
  source_event: Record<string, unknown>;
  mitigation_plan?: string | null;
  mitigation?: string | null;
  evidence_grade?: string | null;
  due_at?: string | null;
  created_by?: string;
  likelihood?: number;
  impact?: number;
  risk_type?: string;
  if_condition?: string | null;
  then_impact?: string | null;
  exploitation_plan?: string | null;
  due_date?: string | null;
  next_step?: string | null;
}

export interface RiskRow {
  id: number;
  title: string;
  description: string | null;
  category: string;
  severity: string;
  status: string;
  owner: string | null;
  opportunity_id: number | null;
  related_capture_id: number | null;
  related_pipeline_item_id: string | null;
  related_action_item_id: string | null;
  source: string;
  source_event: Record<string, unknown>;
  mitigation_plan: string | null;
  mitigation: string | null;
  mitigation_doc_ids: string[];
  evidence_grade: string | null;
  identified_at: string;
  resolved_at: string | null;
  due_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  likelihood: number;
  impact: number;
  risk_type: string;
  if_condition: string | null;
  then_impact: string | null;
  exploitation_plan: string | null;
  due_date: string | null;
  next_step: string | null;
}

/* ── Create risk (with dedup check) ────────────────────────── */

const DEDUP_WINDOW_DAYS = 7;

/**
 * Check for a duplicate risk on the same entity within DEDUP_WINDOW_DAYS.
 * Uses simple title+description substring matching.
 * Returns the existing risk id if a duplicate is found, null otherwise.
 */
export async function findDuplicateRisk(
  input: CreateRiskInput,
  client?: pg.PoolClient,
): Promise<number | null> {
  const db = client ?? pool;
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Match on same opportunity
  if (input.opportunity_id) {
    params.push(input.opportunity_id);
    conditions.push(`r.opportunity_id = $${params.length}`);
  } else if (input.related_capture_id) {
    params.push(input.related_capture_id);
    conditions.push(`r.related_capture_id = $${params.length}`);
  } else {
    return null; // no entity link = no dedup
  }

  // Within window
  params.push(DEDUP_WINDOW_DAYS);
  conditions.push(`r.created_at > NOW() - ($${params.length} || ' days')::interval`);

  // Similar title (case-insensitive)
  params.push(input.title.toLowerCase());
  conditions.push(`LOWER(r.title) = $${params.length}`);

  const { rows } = await db.query<{ id: number }>(
    `SELECT r.id FROM risks r WHERE ${conditions.join(' AND ')} LIMIT 1`,
    params,
  );

  return rows[0]?.id ?? null;
}

/**
 * Create a risk. If a duplicate exists within the dedup window, logs a
 * `duplicate_fire` event on the existing risk instead of creating a new row.
 */
export async function createRisk(
  input: CreateRiskInput,
  skipDedup = false,
): Promise<{ risk_id: number; deduplicated: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (!skipDedup) {
      const existingId = await findDuplicateRisk(input, client);
      if (existingId) {
        await logRiskEvent(existingId, 'duplicate_fire', {
          original_title: input.title,
          original_description: input.description,
          source: input.source,
          source_event: input.source_event,
        }, input.created_by ?? 'system', client);
        await client.query('COMMIT');
        return { risk_id: existingId, deduplicated: true };
      }
    }

    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO risks
         (title, description, category, severity, status, owner,
          opportunity_id, related_capture_id, related_pipeline_item_id,
          related_action_item_id, source, source_event,
          mitigation_plan, mitigation, evidence_grade, due_at, created_by,
          likelihood, impact, risk_type, if_condition, then_impact,
          exploitation_plan, due_date, next_step, identified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,NOW())
       RETURNING id`,
      [
        input.title,
        input.description,
        input.category,
        input.severity,
        input.status ?? 'open',
        input.owner ?? null,
        input.opportunity_id ?? null,
        input.related_capture_id ?? null,
        input.related_pipeline_item_id ?? null,
        input.related_action_item_id ?? null,
        input.source,
        JSON.stringify(input.source_event),
        input.mitigation_plan ?? null,
        input.mitigation ?? null,
        input.evidence_grade ?? null,
        input.due_at ?? null,
        input.created_by ?? 'system',
        input.likelihood ?? 3,
        input.impact ?? 3,
        input.risk_type ?? 'negative',
        input.if_condition ?? null,
        input.then_impact ?? null,
        input.exploitation_plan ?? null,
        input.due_date ?? null,
        input.next_step ?? null,
      ],
    );

    const riskId = rows[0].id;

    await logRiskEvent(riskId, 'created', {
      title: input.title,
      source: input.source,
      severity: input.severity,
      category: input.category,
    }, input.created_by ?? 'system', client);

    await client.query('COMMIT');
    return { risk_id: riskId, deduplicated: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ── Risk events ───────────────────────────────────────────── */

export async function logRiskEvent(
  riskId: number,
  eventType: RiskEventType,
  detail: Record<string, unknown>,
  actor: string,
  client?: pg.PoolClient,
): Promise<void> {
  const db = client ?? pool;
  await db.query(
    `INSERT INTO risk_events (risk_id, event_type, detail, actor)
     VALUES ($1, $2, $3, $4)`,
    [riskId, eventType, JSON.stringify(detail), actor],
  );
}

export async function getRiskEvents(riskId: number): Promise<Array<{
  id: number;
  risk_id: number;
  event_type: string;
  detail: Record<string, unknown>;
  actor: string;
  created_at: string;
}>> {
  const { rows } = await pool.query(
    `SELECT id, risk_id, event_type, detail, actor, created_at::text
     FROM risk_events
     WHERE risk_id = $1
     ORDER BY created_at DESC`,
    [riskId],
  );
  return rows as Array<{
    id: number; risk_id: number; event_type: string;
    detail: Record<string, unknown>; actor: string; created_at: string;
  }>;
}

/* ── Launchpad roll-up ─────────────────────────────────────── */

export async function getLaunchpadRisks(): Promise<RiskRow[]> {
  const { rows } = await pool.query<RiskRow>(
    `SELECT r.*, o.title AS opportunity_title
     FROM risks r
     LEFT JOIN opportunities o ON o.id = r.opportunity_id
     WHERE r.status = 'open' AND r.severity IN ('critical','high')
     ORDER BY
       CASE r.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
       r.created_at DESC
     LIMIT 5`,
  );
  return rows;
}

/* ── Hooks: create risks from system events ────────────────── */

/** Map doctrine principle violations to risk categories */
const DOCTRINE_CATEGORY_MAP: Record<string, RiskCategory> = {
  alignment: 'doctrine_violation',
  ethics: 'compliance',
  teamwork: 'teaming',
  data_first: 'doctrine_violation',
  relentless_execution: 'schedule',
  relationships: 'teaming',
  market_mission_brand: 'doctrine_violation',
  margin_floor: 'margin',
};

export function doctrineViolationCategory(ruleType: string): RiskCategory {
  return DOCTRINE_CATEGORY_MAP[ruleType] ?? 'doctrine_violation';
}

/**
 * Create a risk from a doctrine rule fire (F-303 integration).
 */
export async function createDoctrineRisk(params: {
  ruleType: string;
  ruleName: string;
  entityKind: string;
  entityId: string;
  opportunityId?: number | null;
  detail: string;
  severity?: RiskSeverity;
}): Promise<{ risk_id: number; deduplicated: boolean }> {
  return createRisk({
    title: `Doctrine violation: ${params.ruleName}`,
    description: params.detail,
    category: doctrineViolationCategory(params.ruleType),
    severity: params.severity ?? 'high',
    source: 'doctrine_rule',
    source_event: {
      type: 'doctrine_rule_fire',
      rule_type: params.ruleType,
      rule_name: params.ruleName,
      entity_kind: params.entityKind,
      entity_id: params.entityId,
    },
    opportunity_id: params.opportunityId ?? null,
    created_by: 'doctrine_engine',
  });
}

/**
 * Create a risk from a color review finding.
 */
export async function createColorReviewRisk(params: {
  findingTitle: string;
  findingDetail: string;
  reviewId: string;
  section?: string;
  opportunityId?: number | null;
  captureId?: number | null;
  severity?: RiskSeverity;
}): Promise<{ risk_id: number; deduplicated: boolean }> {
  return createRisk({
    title: `Color review finding: ${params.findingTitle}`,
    description: params.findingDetail,
    category: 'compliance',
    severity: params.severity ?? 'medium',
    source: 'color_review',
    source_event: {
      type: 'color_review_finding',
      review_id: params.reviewId,
      section: params.section ?? null,
    },
    opportunity_id: params.opportunityId ?? null,
    related_capture_id: params.captureId ?? null,
    created_by: 'color_review',
  });
}

/**
 * Create a risk from a Sentinel flag (ingest/credit/plumbing failure).
 */
export async function createSentinelRisk(params: {
  title: string;
  detail: string;
  sourceKey: string;
  category?: RiskCategory;
  severity?: RiskSeverity;
}): Promise<{ risk_id: number; deduplicated: boolean }> {
  return createRisk({
    title: `Sentinel: ${params.title}`,
    description: params.detail,
    category: params.category ?? 'technical',
    severity: params.severity ?? 'medium',
    source: 'sentinel',
    source_event: {
      type: 'sentinel_flag',
      source_key: params.sourceKey,
    },
    created_by: 'sentinel',
  });
}

/* ── Owner-required validation ─────────────────────────────── */

export function validateStatusTransition(
  currentStatus: string,
  newStatus: string,
  severity: string,
  owner: string | null,
): string | null {
  if (
    (severity === 'critical' || severity === 'high') &&
    currentStatus === 'open' &&
    newStatus !== 'open' &&
    !owner
  ) {
    return 'Critical/high severity risks must have an owner before leaving open status';
  }
  return null;
}
