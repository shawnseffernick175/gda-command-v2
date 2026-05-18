/**
 * Record versioning service — W3 foundation.
 * Call recordVersion() from every mutating service method.
 * The Postgres trigger (fn_auto_version) provides a safety net
 * but this service produces richer change_summary data.
 */

import { getPool } from "./db";
import { log } from "./logger";

const ALLOWED_TABLES = new Set([
  "opportunities",
  "capture_plans",
  "capture_activities",
  "proposals",
  "proposal_sections",
  "compliance_requirements",
  "contacts",
  "intel_items",
  "doctrine_drafts",
  "risk_register",
  "color_reviews",
  "competitor_profiles",
  "approvals",
  "knowledge_documents",
  "cpars_records",
]);

export function isAllowedTable(table: string): boolean {
  return ALLOWED_TABLES.has(table);
}

export interface VersionEntry {
  version_id: string;
  table_name: string;
  record_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  changed_by: string;
  changed_at: string;
  change_type: "create" | "update" | "delete" | "restore";
  change_summary: Record<string, { from: unknown; to: unknown }> | null;
}

/**
 * Compute a field-level diff between two snapshots.
 * Returns {field: {from, to}} for changed fields only.
 */
function computeDiff(
  prev: Record<string, unknown> | null,
  current: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> | null {
  if (!prev) return null;
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(current)]);
  for (const key of allKeys) {
    if (key === "updated_at" || key === "created_at") continue;
    const a = JSON.stringify(prev[key] ?? null);
    const b = JSON.stringify(current[key] ?? null);
    if (a !== b) {
      diff[key] = { from: prev[key] ?? null, to: current[key] ?? null };
    }
  }
  return Object.keys(diff).length > 0 ? diff : null;
}

/**
 * Record a new version of a record. Call this AFTER the DB write succeeds.
 *
 * @param table - The Postgres table name (e.g. 'opportunities')
 * @param recordId - The primary key value
 * @param snapshot - The full row state after the change
 * @param userId - Who made the change (user ID or system identifier)
 * @param changeType - 'create' | 'update' | 'delete' | 'restore'
 * @param previousSnapshot - Optional previous state for diff computation
 */
export async function recordVersion(
  table: string,
  recordId: string,
  snapshot: Record<string, unknown>,
  userId: string,
  changeType: "create" | "update" | "delete" | "restore",
  previousSnapshot?: Record<string, unknown> | null
): Promise<VersionEntry | null> {
  const pool = getPool();
  if (!pool) return null;

  try {
    // Get next version number
    const { rows: verRows } = await pool.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_ver
       FROM record_version
       WHERE table_name = $1 AND record_id = $2`,
      [table, recordId]
    );
    const nextVer = verRows[0]?.next_ver ?? 1;

    const changeSummary = computeDiff(previousSnapshot ?? null, snapshot);

    const { rows } = await pool.query(
      `INSERT INTO record_version (table_name, record_id, version_number, snapshot, changed_by, change_type, change_summary)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb)
       RETURNING *`,
      [
        table,
        recordId,
        nextVer,
        JSON.stringify(snapshot),
        userId,
        changeType,
        changeSummary ? JSON.stringify(changeSummary) : null,
      ]
    );

    return rows[0] as VersionEntry;
  } catch (err) {
    log.error("versioning_error", {
      table,
      recordId,
      changeType,
      error: (err as Error).message,
    });
    return null;
  }
}

/**
 * Get version history for a record.
 */
export async function getVersionHistory(
  table: string,
  recordId: string,
  limit = 50
): Promise<VersionEntry[]> {
  const pool = getPool();
  if (!pool) return [];

  try {
    const { rows } = await pool.query(
      `SELECT * FROM record_version
       WHERE table_name = $1 AND record_id = $2
       ORDER BY version_number DESC
       LIMIT $3`,
      [table, recordId, limit]
    );
    return rows as VersionEntry[];
  } catch (err) {
    log.error("version_history_error", {
      table,
      recordId,
      error: (err as Error).message,
    });
    return [];
  }
}

/**
 * Get a specific version snapshot.
 */
export async function getVersion(
  table: string,
  recordId: string,
  versionNumber: number
): Promise<VersionEntry | null> {
  const pool = getPool();
  if (!pool) return null;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM record_version
       WHERE table_name = $1 AND record_id = $2 AND version_number = $3`,
      [table, recordId, versionNumber]
    );
    return (rows[0] as VersionEntry) ?? null;
  } catch (err) {
    log.error("get_version_error", {
      table,
      recordId,
      versionNumber,
      error: (err as Error).message,
    });
    return null;
  }
}

/**
 * Soft-delete a record by setting deleted_at.
 * Also records a 'delete' version.
 */
export async function softDelete(
  table: string,
  recordId: string,
  userId: string,
  pkColumn = "id"
): Promise<boolean> {
  if (!isAllowedTable(table)) return false;
  const pool = getPool();
  if (!pool) return false;

  try {
    // Fetch current state before soft-delete
    const { rows: current } = await pool.query(
      `SELECT * FROM ${table} WHERE ${pkColumn} = $1 AND deleted_at IS NULL`,
      [recordId]
    );
    if (current.length === 0) return false;

    // Set deleted_at
    await pool.query(
      `UPDATE ${table} SET deleted_at = NOW() WHERE ${pkColumn} = $1`,
      [recordId]
    );

    // Record the delete version
    await recordVersion(table, recordId, current[0], userId, "delete");

    return true;
  } catch (err) {
    log.error("soft_delete_error", {
      table,
      recordId,
      error: (err as Error).message,
    });
    return false;
  }
}

/**
 * Restore a record to a specific version.
 * Creates a new version with change_type='restore'.
 */
export async function restoreVersion(
  table: string,
  recordId: string,
  versionNumber: number,
  userId: string,
  pkColumn = "id"
): Promise<Record<string, unknown> | null> {
  if (!isAllowedTable(table)) return null;
  const pool = getPool();
  if (!pool) return null;

  try {
    const version = await getVersion(table, recordId, versionNumber);
    if (!version) return null;

    const snapshot = version.snapshot;

    // Remove meta fields that shouldn't be overwritten
    const { version_id, ...restoreData } = snapshot as Record<string, unknown> & { version_id?: unknown };
    delete restoreData.created_at;
    delete restoreData.deleted_at;

    // Build UPDATE SET clause from snapshot fields (quote identifiers to prevent injection)
    const quoteIdent = (s: string) => '"' + s.replace(/"/g, '""') + '"';
    const keys = Object.keys(restoreData).filter(k => k !== pkColumn);
    const setClauses = keys.map((k, i) => `${quoteIdent(k)} = $${i + 2}`);
    const values = keys.map(k => {
      const val = restoreData[k];
      if (Array.isArray(val)) return val; // let pg driver handle TEXT[] conversion
      if (val !== null && typeof val === "object") return JSON.stringify(val);
      return val;
    });

    // Also undelete if it was soft-deleted
    setClauses.push(`deleted_at = NULL`);
    setClauses.push(`updated_at = NOW()`);

    await pool.query(
      `UPDATE ${table} SET ${setClauses.join(", ")} WHERE ${pkColumn} = $1`,
      [recordId, ...values]
    );

    // Fetch the restored row
    const { rows } = await pool.query(
      `SELECT * FROM ${table} WHERE ${pkColumn} = $1`,
      [recordId]
    );

    // Record the restore version
    await recordVersion(table, recordId, rows[0], userId, "restore", snapshot as Record<string, unknown>);

    return rows[0];
  } catch (err) {
    log.error("restore_version_error", {
      table,
      recordId,
      versionNumber,
      error: (err as Error).message,
    });
    return null;
  }
}
