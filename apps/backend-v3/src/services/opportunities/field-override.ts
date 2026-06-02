/**
 * Field override API with audit trail (F-413).
 *
 * Lets an operator override a single merged field on a unified opportunity
 * (e.g. correct a wrong agency or estimated value). Override values take
 * precedence over all source data in the merge service (F-405,
 * applyOverrides()). The current override per (internal_id, field_name) lives
 * in `unified_opportunity_field_overrides` (UNIQUE constraint → one row each).
 *
 * Because that table keeps only the current value, every mutation is also
 * recorded as an immutable row in `unified_opportunity_field_override_audit`
 * (v3_028) — capturing old value, new value, who, why, and when. The override
 * write and its audit row are committed in a single transaction so they can
 * never diverge.
 *
 *   PUT /v3/opportunities/:internal_id/field-override
 *     body: { field_name, field_value, set_by?, reason? }
 *           field_value: null  → clears the override (action='clear')
 *           field_value: <any> → sets/updates the override (action='set')
 *
 * Confirming/clearing an override invalidates the F-405 merge cache for the
 * affected internal_id so the next read reflects the change.
 */

import type pg from 'pg';
import { invalidateMergeCache } from './merge.js';

// ─── Allow-list ───────────────────────────────────────────────────────────────

/**
 * Fields an operator is permitted to override. Mirrors the fields the merge
 * service (F-405) actually honors from the override map. Anything outside this
 * set is rejected with 400 so we don't silently store overrides that the merge
 * layer will never apply.
 */
export const OVERRIDABLE_FIELDS = new Set<string>([
  'title',
  'agency',
  'sub_agency',
  'naics',
  'psc',
  'description',
  'solicitation_number',
  'estimated_value_cents',
  'response_due_at',
  'posted_at',
  'lifecycle_stage',
  'place_of_performance',
  'set_aside',
]);

export type OverrideAction = 'set' | 'clear';

export interface FieldOverrideInput {
  internal_id: string;
  field_name: string;
  /** null clears the override; any other value sets it. */
  field_value: unknown;
  set_by: string;
  reason?: string | null;
}

export interface FieldOverrideResult {
  internal_id: string;
  field_name: string;
  action: OverrideAction;
  /** Current override value after the operation (null after a clear). */
  field_value: unknown;
  old_value: unknown;
  set_by: string;
  reason: string | null;
  audit_id: number;
  at: string;
}

export interface FieldOverrideAuditEntry {
  id: number;
  internal_id: string;
  field_name: string;
  action: OverrideAction;
  old_value: unknown;
  new_value: unknown;
  set_by: string;
  reason: string | null;
  created_at: string;
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function isOverridableField(field: unknown): field is string {
  return typeof field === 'string' && OVERRIDABLE_FIELDS.has(field);
}

// ─── Set / clear (transactional, audited) ─────────────────────────────────────

/**
 * Set or clear a field override and record the change in the audit trail.
 *
 * A `field_value` of `null` clears (deletes) any existing override; any other
 * value upserts it. The override mutation and its audit row are written in one
 * transaction. Returns null only when the target opportunity does not exist
 * (FK violation surfaces as a clean 404 from the route).
 */
export async function setFieldOverrideWithAudit(
  pool: pg.Pool,
  input: FieldOverrideInput,
): Promise<FieldOverrideResult | null> {
  const isClear = input.field_value === null;
  const action: OverrideAction = isClear ? 'clear' : 'set';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Guard: the opportunity must exist. Doing this explicitly gives a clean
    // 404 instead of relying on an FK error string.
    const exists = await client.query(
      'SELECT 1 FROM unified_opportunities WHERE internal_id = $1',
      [input.internal_id],
    );
    if (exists.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    // Capture the prior override value (for the audit old_value).
    const prior = await client.query(
      `SELECT field_value_json FROM unified_opportunity_field_overrides
        WHERE internal_id = $1 AND field_name = $2`,
      [input.internal_id, input.field_name],
    );
    const oldValue =
      prior.rowCount && prior.rowCount > 0
        ? (prior.rows[0] as { field_value_json: unknown }).field_value_json
        : null;

    let newValue: unknown = null;

    if (isClear) {
      await client.query(
        `DELETE FROM unified_opportunity_field_overrides
          WHERE internal_id = $1 AND field_name = $2`,
        [input.internal_id, input.field_name],
      );
    } else {
      // Same upsert semantics as OpportunityRepo.setFieldOverride.
      await client.query(
        `INSERT INTO unified_opportunity_field_overrides
           (internal_id, field_name, field_value_json, set_by, reason)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (internal_id, field_name)
         DO UPDATE SET
           field_value_json = EXCLUDED.field_value_json,
           set_by = EXCLUDED.set_by,
           set_at = NOW(),
           reason = EXCLUDED.reason`,
        [
          input.internal_id,
          input.field_name,
          JSON.stringify(input.field_value),
          input.set_by,
          input.reason ?? null,
        ],
      );
      newValue = input.field_value;
    }

    // Append the immutable audit row.
    const audit = await client.query(
      `INSERT INTO unified_opportunity_field_override_audit
         (internal_id, field_name, action, old_value_json, new_value_json, set_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at::text AS created_at`,
      [
        input.internal_id,
        input.field_name,
        action,
        oldValue === null ? null : JSON.stringify(oldValue),
        isClear ? null : JSON.stringify(input.field_value),
        input.set_by,
        input.reason ?? null,
      ],
    );

    await client.query('COMMIT');

    // Override changed → merged view for this opportunity is stale.
    invalidateMergeCache(input.internal_id);

    const auditRow = audit.rows[0] as { id: number; created_at: string };
    return {
      internal_id: input.internal_id,
      field_name: input.field_name,
      action,
      field_value: newValue,
      old_value: oldValue,
      set_by: input.set_by,
      reason: input.reason ?? null,
      audit_id: Number(auditRow.id),
      at: auditRow.created_at,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ─── Read the audit trail ─────────────────────────────────────────────────────

/**
 * Return the override audit trail for one opportunity (optionally a single
 * field), newest first.
 */
export async function getFieldOverrideAudit(
  pool: pg.Pool,
  internalId: string,
  fieldName?: string,
): Promise<FieldOverrideAuditEntry[]> {
  const params: unknown[] = [internalId];
  let where = 'internal_id = $1';
  if (fieldName) {
    where += ' AND field_name = $2';
    params.push(fieldName);
  }

  const res = await pool.query(
    `SELECT id, internal_id, field_name, action,
            old_value_json, new_value_json, set_by, reason,
            created_at::text AS created_at
       FROM unified_opportunity_field_override_audit
      WHERE ${where}
      ORDER BY created_at DESC, id DESC`,
    params,
  );

  return (res.rows as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    internal_id: r.internal_id as string,
    field_name: r.field_name as string,
    action: r.action as OverrideAction,
    old_value: r.old_value_json ?? null,
    new_value: r.new_value_json ?? null,
    set_by: r.set_by as string,
    reason: (r.reason as string) ?? null,
    created_at: r.created_at as string,
  }));
}
