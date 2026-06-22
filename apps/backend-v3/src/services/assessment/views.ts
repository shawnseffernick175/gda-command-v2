/**
 * Read + action helpers for the intake assessment funnel:
 *   - Ops Tracker list (survivors, ranked by AI pWin/fit DESC)
 *   - Pass list (auto-declined, with reason)
 *   - rescue: move a passed opportunity back to ops_tracker
 *   - promote: user-only path that creates a pipeline_item (capture_owner = user)
 *
 * Owner rule (binding): promote is the ONLY new way an opportunity enters the
 * pipeline. capture_owner is ALWAYS the requesting user — never 'system'.
 */

import { pool } from '../../lib/db.js';
import { recordAuditLog } from '../audit/audit-log.js';

export interface AssessmentListItem {
  id: string;
  title: string;
  agency: string | null;
  naics: string | null;
  set_aside: string | null;
  response_due_at: string | null;
  value_min: number | null;
  value_max: number | null;
  assessment_status: string;
  assessment_reason: string | null;
  assessment_score: number | null;
  assessed_at: string | null;
}

interface AssessmentRow {
  id: string;
  title: string;
  agency: string | null;
  naics: string | null;
  set_aside: string | null;
  response_due_at: string | null;
  value_min: string | null;
  value_max: string | null;
  assessment_status: string;
  assessment_reason: string | null;
  assessment_score: string | null;
  assessed_at: string | null;
}

function rowToItem(r: AssessmentRow): AssessmentListItem {
  return {
    id: r.id,
    title: r.title,
    agency: r.agency,
    naics: r.naics,
    set_aside: r.set_aside,
    response_due_at: r.response_due_at,
    value_min: r.value_min != null ? Number(r.value_min) : null,
    value_max: r.value_max != null ? Number(r.value_max) : null,
    assessment_status: r.assessment_status,
    assessment_reason: r.assessment_reason,
    assessment_score: r.assessment_score != null ? Number(r.assessment_score) : null,
    assessed_at: r.assessed_at,
  };
}

const LIST_COLUMNS = `
  id::text, title, agency, naics, set_aside,
  response_due_at::text, value_min, value_max,
  assessment_status, assessment_reason, assessment_score, assessed_at::text
`;

/**
 * Ops Tracker: survivors awaiting the user's promote decision, best-fit first.
 * Ranked by assessment_score DESC (NULLs last), then soonest deadline.
 */
export async function listOpsTracker(limit: number): Promise<AssessmentListItem[]> {
  const { rows } = await pool.query<AssessmentRow>(
    `SELECT ${LIST_COLUMNS}
       FROM opportunities
      WHERE deleted_at IS NULL AND assessment_status = 'ops_tracker'
      ORDER BY assessment_score DESC NULLS LAST, response_due_at ASC NULLS LAST, id DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map(rowToItem);
}

/**
 * Pass list: auto-declined opportunities, with reason. Most recently assessed
 * first so the user can review and rescue.
 */
export async function listPass(limit: number): Promise<AssessmentListItem[]> {
  const { rows } = await pool.query<AssessmentRow>(
    `SELECT ${LIST_COLUMNS}
       FROM opportunities
      WHERE deleted_at IS NULL AND assessment_status = 'pass'
      ORDER BY assessed_at DESC NULLS LAST, id DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map(rowToItem);
}

/**
 * Rescue a passed opportunity back into the Ops Tracker. Reversible per the
 * owner rule. Also clears relevance_status='auto_pass' back to 'relevant' so
 * the opportunity reappears in the Active list (F-601).
 *
 * Returns the updated item, or null if not found / not in 'pass'.
 */
export async function rescueToOpsTracker(opportunityId: string): Promise<AssessmentListItem | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Snapshot old state for audit
    const oldRes = await client.query<{ relevance_status: string | null; assessment_status: string }>(
      `SELECT relevance_status, assessment_status FROM opportunities
        WHERE id = $1 AND deleted_at IS NULL AND assessment_status = 'pass'`,
      [opportunityId],
    );
    if (oldRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const old = oldRes.rows[0]!;

    const { rows } = await client.query<AssessmentRow>(
      `UPDATE opportunities
          SET assessment_status = 'ops_tracker',
              assessment_reason = 'ops_tracker: rescued_from_pass',
              relevance_status  = 'relevant',
              relevance_reason  = 'rescued: owner pulled back to Ops Tracker',
              assessed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL AND assessment_status = 'pass'
        RETURNING ${LIST_COLUMNS}`,
      [opportunityId],
    );

    if (rows[0]) {
      await recordAuditLog(client, {
        action: 'rescue_to_ops_tracker',
        table_name: 'opportunities',
        record_id: Number(opportunityId),
        old_values: {
          relevance_status: old.relevance_status,
          assessment_status: old.assessment_status,
        },
        new_values: {
          relevance_status: 'relevant',
          assessment_status: 'ops_tracker',
        },
        actor: 'user:rescue',
        source: 'user',
      });
    }

    await client.query('COMMIT');
    return rows[0] ? rowToItem(rows[0]) : null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface PromoteResult {
  pipeline_item_id: string;
  opportunity_id: string;
  capture_owner: string;
  created: boolean;
}

export class PromoteError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Promote an Ops Tracker opportunity into the pipeline. This is the ONLY new
 * path into pipeline_items. capture_owner is forced to the requesting user.
 *
 * @param opportunityId  opportunity to promote
 * @param captureOwner   the requesting user's display identity (NEVER 'system')
 * @param createdByUserId numeric user id for created_by, or null
 */
export async function promoteToPipeline(
  opportunityId: string,
  captureOwner: string,
  createdByUserId: string | null,
): Promise<PromoteResult> {
  const owner = captureOwner?.trim();
  if (!owner || owner.toLowerCase() === 'system') {
    throw new PromoteError('capture_owner must be the requesting user, not "system"', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const oppRes = await client.query<{ id: string; assessment_status: string; source_id: string | null }>(
      `SELECT id::text, assessment_status, source_id::text
         FROM opportunities
        WHERE id = $1 AND deleted_at IS NULL
        FOR UPDATE`,
      [opportunityId],
    );
    const opp = oppRes.rows[0];
    if (!opp) {
      throw new PromoteError('Opportunity not found', 404);
    }
    if (opp.assessment_status !== 'ops_tracker') {
      throw new PromoteError(
        `Only Ops Tracker opportunities can be promoted (current: ${opp.assessment_status})`,
        400,
      );
    }

    // If a pipeline item already exists, do not create a second one.
    const existing = await client.query<{ id: string; capture_owner: string }>(
      `SELECT id::text, capture_owner FROM pipeline_items WHERE opportunity_id = $1 ORDER BY id DESC LIMIT 1`,
      [opportunityId],
    );
    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return {
        pipeline_item_id: existing.rows[0]!.id,
        opportunity_id: opportunityId,
        capture_owner: existing.rows[0]!.capture_owner,
        created: false,
      };
    }

    // Mark the opportunity qualified — it has cleared assessment and the user
    // has personally chosen to pursue it.
    await client.query(
      `UPDATE opportunities SET status = 'qualified', updated_at = NOW() WHERE id = $1`,
      [opportunityId],
    );

    const srcRes = await client.query<{ id: string }>(
      `INSERT INTO sources (kind, title, retrieved_at)
       VALUES ('internal', 'Pipeline promotion (Ops Tracker)', NOW()) RETURNING id`,
    );
    const sourceId = srcRes.rows[0]!.id;

    const numericUserId = createdByUserId && /^\d+$/.test(createdByUserId) ? createdByUserId : null;

    const insertRes = await client.query<{ id: string }>(
      `INSERT INTO pipeline_items
         (opportunity_id, capture_owner, stage, source_id, created_by, created_at, updated_at)
       VALUES ($1, $2, 'qualify', $3, $4, NOW(), NOW())
       RETURNING id::text`,
      [opportunityId, owner, sourceId, numericUserId],
    );

    await client.query('COMMIT');

    return {
      pipeline_item_id: insertRes.rows[0]!.id,
      opportunity_id: opportunityId,
      capture_owner: owner,
      created: true,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
