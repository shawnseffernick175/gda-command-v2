/**
 * Decision Memory service — CRUD for agent_decisions.
 * Decisions are immutable once written; only outcome can be appended via recordOutcome.
 */

import { pool } from '../../lib/db.js';
import type {
  AgentDecisionRow,
  DecisionCreateInput,
  DecisionOutcomeInput,
  DecisionListFilters,
} from './types.js';

export type {
  AgentDecisionRow,
  DecisionCreateInput,
  DecisionOutcomeInput,
  DecisionListFilters,
} from './types.js';

const VALID_KINDS = new Set([
  'qualify','kill','pass','bid','no_bid',
  'team_with','avoid_team','win','loss',
  'withdraw','exclusion_override',
]);

const VALID_ENTITY_KINDS = new Set([
  'opportunity','pursuit','capture','partner','document','pipeline_item',
]);

const VALID_OUTCOMES = new Set(['won','lost','withdrawn','no_award']);

export function validateDecisionInput(input: DecisionCreateInput): string | null {
  if (!VALID_KINDS.has(input.kind)) return `Invalid kind: ${input.kind}`;
  if (!VALID_ENTITY_KINDS.has(input.entity_kind)) return `Invalid entity_kind: ${input.entity_kind}`;
  if (!input.entity_id) return 'entity_id is required';
  if (!input.rationale || input.rationale.trim() === '') return 'rationale is required and must not be empty';
  if (!input.made_by || input.made_by.trim() === '') return 'made_by is required';
  return null;
}

export async function createDecision(input: DecisionCreateInput): Promise<AgentDecisionRow> {
  const res = await pool.query<AgentDecisionRow>(
    `INSERT INTO agent_decisions (
      kind, entity_kind, entity_id, rationale, evidence_refs,
      doctrine_alignment_score, exclusion_triggers, margin_check,
      made_by, parent_decision_id, agent_run_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      input.kind,
      input.entity_kind,
      input.entity_id,
      input.rationale,
      JSON.stringify(input.evidence_refs ?? []),
      input.doctrine_alignment_score ?? null,
      input.exclusion_triggers ? JSON.stringify(input.exclusion_triggers) : null,
      input.margin_check ? JSON.stringify(input.margin_check) : null,
      input.made_by,
      input.parent_decision_id ?? null,
      input.agent_run_id ?? null,
    ],
  );
  return res.rows[0]!;
}

export async function listDecisions(filters: DecisionListFilters): Promise<AgentDecisionRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.entity_kind) {
    conditions.push(`entity_kind = $${idx++}`);
    params.push(filters.entity_kind);
  }
  if (filters.entity_id) {
    conditions.push(`entity_id = $${idx++}`);
    params.push(filters.entity_id);
  }
  if (filters.kind) {
    conditions.push(`kind = $${idx++}`);
    params.push(filters.kind);
  }
  if (filters.since) {
    conditions.push(`made_at >= $${idx++}`);
    params.push(filters.since);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(filters.limit ?? 100, 500);
  const offset = filters.offset ?? 0;

  const res = await pool.query<AgentDecisionRow>(
    `SELECT * FROM agent_decisions ${where} ORDER BY made_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset],
  );
  return res.rows;
}

export async function getDecisionById(id: string): Promise<AgentDecisionRow | null> {
  const res = await pool.query<AgentDecisionRow>(
    'SELECT * FROM agent_decisions WHERE id = $1',
    [id],
  );
  return res.rows[0] ?? null;
}

export async function recordOutcome(
  id: string,
  input: DecisionOutcomeInput,
): Promise<AgentDecisionRow | null> {
  if (!VALID_OUTCOMES.has(input.outcome)) return null;

  const existing = await getDecisionById(id);
  if (!existing) return null;
  if (existing.outcome !== null) return null;

  const res = await pool.query<AgentDecisionRow>(
    `UPDATE agent_decisions
     SET outcome = $2,
         outcome_recorded_at = now(),
         outcome_evidence_refs = $3
     WHERE id = $1 AND outcome IS NULL
     RETURNING *`,
    [
      id,
      input.outcome,
      input.outcome_evidence_refs ? JSON.stringify(input.outcome_evidence_refs) : null,
    ],
  );

  if (res.rows.length === 0) return null;

  if (input.outcome === 'won' || input.outcome === 'lost' || input.outcome === 'no_award') {
    const entityId = existing.entity_id;
    const latestFeature = await pool.query<{ id: string }>(
      'SELECT id FROM pwin_features WHERE opportunity_id = $1 ORDER BY computed_at DESC LIMIT 1',
      [entityId],
    );
    if (latestFeature.rows[0]) {
      await pool.query(
        `INSERT INTO pwin_outcomes (opportunity_id, feature_snapshot_id, outcome, outcome_value, decision_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [entityId, latestFeature.rows[0].id, input.outcome, input.outcome_value ?? null, id],
      );
    }
  }

  return res.rows[0]!;
}

export async function getRecentDecisionsSummary(
  days: number = 7,
  limit: number = 10,
): Promise<AgentDecisionRow[]> {
  const res = await pool.query<AgentDecisionRow>(
    `SELECT * FROM agent_decisions
     WHERE made_at >= now() - $1::interval
     ORDER BY made_at DESC
     LIMIT $2`,
    [`${days} days`, limit],
  );
  return res.rows;
}

export async function lookupSimilarDecisions(
  entityKind: string,
  kind: string,
  limit: number = 5,
): Promise<AgentDecisionRow[]> {
  const res = await pool.query<AgentDecisionRow>(
    `SELECT * FROM agent_decisions
     WHERE entity_kind = $1 AND kind = $2
     ORDER BY made_at DESC LIMIT $3`,
    [entityKind, kind, limit],
  );
  return res.rows;
}
