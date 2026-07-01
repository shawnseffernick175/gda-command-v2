import { pool } from '../../lib/db.js';
import { checkRiskDedup } from './dedup.js';
import { createRiskEvent } from './risk-events.js';

interface RiskCreatePayload {
  title: string;
  description: string;
  category: string;
  severity: string;
  opportunityId?: number | null;
  captureId?: number | null;
  pipelineItemId?: number | null;
  actionItemId?: number | null;
  sourceEvent: Record<string, unknown>;
  createdBy?: string;
}

async function createRiskFromHook(payload: RiskCreatePayload): Promise<number | null> {
  const dedupResult = await checkRiskDedup(
    payload.title,
    payload.description,
    payload.opportunityId ?? null,
    payload.captureId ?? null,
    payload.pipelineItemId ?? null,
  );

  if (dedupResult.isDuplicate && dedupResult.existingRiskId) {
    await createRiskEvent(dedupResult.existingRiskId, 'duplicate_fire', {
      attempted_title: payload.title,
      source_event: payload.sourceEvent,
      hook_source: 'system',
    }, payload.createdBy ?? 'system');
    return dedupResult.existingRiskId;
  }

  const { rows } = await pool.query(
    `INSERT INTO risks
       (title, description, category, severity, likelihood, impact, status, owner,
        opportunity_id, related_capture_id, related_pipeline_item_id, related_action_item_id,
        source_event, source, created_by, identified_at)
     VALUES ($1, $2, $3, $4, 3, 3, 'open', NULL, $5, $6, $7, $8, $9, 'ai_generated', $10, NOW())
     RETURNING id`,
    [
      payload.title,
      payload.description,
      payload.category,
      payload.severity,
      payload.opportunityId ?? null,
      payload.captureId ?? null,
      payload.pipelineItemId ?? null,
      payload.actionItemId ?? null,
      JSON.stringify(payload.sourceEvent),
      payload.createdBy ?? 'system',
    ],
  );

  const newId = rows[0].id;
  await createRiskEvent(newId, 'created', {
    source: 'hook',
    ...payload.sourceEvent,
  }, payload.createdBy ?? 'system');

  return newId;
}

/**
 * Hook: Doctrine rule fire creates a risk.
 * Called when F-303 doctrine evaluation fires a violation.
 */
export async function onDoctrineRuleFire(params: {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  violationDescription: string;
  opportunityId?: number;
  captureId?: number;
  severity?: string;
}): Promise<number | null> {
  const categoryMap: Record<string, string> = {
    'pwin_threshold': 'doctrine_violation',
    'set_aside': 'compliance',
    'naics_fit': 'doctrine_violation',
    'value_floor': 'margin',
    'agency_alignment': 'doctrine_violation',
    'past_performance': 'past_performance',
    'clearance': 'certification',
    'teaming': 'teaming',
  };

  return createRiskFromHook({
    title: `Doctrine violation: ${params.ruleName}`,
    description: params.violationDescription,
    category: categoryMap[params.ruleType] ?? 'doctrine_violation',
    severity: params.severity ?? 'high',
    opportunityId: params.opportunityId,
    captureId: params.captureId,
    sourceEvent: {
      type: 'doctrine_rule_fire',
      rule_id: params.ruleId,
      rule_name: params.ruleName,
      rule_type: params.ruleType,
    },
    createdBy: 'doctrine_engine',
  });
}

/**
 * Hook: Color review finding creates a risk.
 * Called when a color review identifies a finding/critique.
 */
export async function onColorReviewFinding(params: {
  reviewId: string;
  stage: string;
  findingTitle: string;
  findingDescription: string;
  section?: string;
  documentId?: string;
  opportunityId?: number;
  captureId?: number;
  severity?: string;
}): Promise<number | null> {
  return createRiskFromHook({
    title: `Color review finding: ${params.findingTitle}`,
    description: params.findingDescription,
    category: 'technical',
    severity: params.severity ?? 'medium',
    opportunityId: params.opportunityId,
    captureId: params.captureId,
    sourceEvent: {
      type: 'color_review_finding',
      review_id: params.reviewId,
      stage: params.stage,
      section: params.section,
      document_id: params.documentId,
    },
    createdBy: 'color_review',
  });
}

/**
 * Hook: Sentinel flag creates a risk.
 * Called when a sentinel event indicates a plumbing/ingest/credit failure.
 */
export async function onSentinelFlag(params: {
  eventId: string;
  eventType: string;
  sourceKey: string;
  title: string;
  context?: string;
  severity?: string;
}): Promise<number | null> {
  const category = params.sourceKey === 'auth' || params.sourceKey === 'cron'
    ? 'technical'
    : 'compliance';

  return createRiskFromHook({
    title: `Sentinel: ${params.title}`,
    description: params.context ?? `Sentinel flagged ${params.eventType} on ${params.sourceKey}`,
    category,
    severity: params.severity ?? 'medium',
    sourceEvent: {
      type: 'sentinel_flag',
      event_id: params.eventId,
      event_type: params.eventType,
      source_key: params.sourceKey,
    },
    createdBy: 'sentinel',
  });
}
