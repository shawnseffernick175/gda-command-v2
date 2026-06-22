/**
 * Unified audit log service (F-442).
 *
 * Provides a reusable write helper (`recordAuditLog`) and a paginated read
 * (`listAuditLog`) for the generic `audit_log` table. The write accepts an
 * optional pg client so callers can include the audit row in an existing
 * transaction — making it atomic with the mutation it records.
 *
 * Columns written: action, table_name, record_id, record_ref, old_values,
 * new_values, actor, user_id, ip_address, user_agent, request_id, source.
 */

import type pg from 'pg';

// ─── Write ──────────────────────────────────────────────────────────────────

export interface AuditLogWrite {
  action: string;
  table_name: string;
  record_id?: number | null;
  record_ref?: string | null;
  old_values?: unknown;
  new_values?: unknown;
  actor?: string | null;
  user_id?: number | null;
  ip_address?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
  /** 'system' | 'user' — distinguishes automated writes from owner actions (F-600). */
  source?: 'system' | 'user' | null;
}

/**
 * Append one immutable audit_log row. Accepts an optional pg client so the
 * caller can include the write in an existing transaction (atomic with the
 * mutation it records). Falls back to pool when no client passed.
 */
export async function recordAuditLog(
  exec: pg.Pool | pg.PoolClient,
  entry: AuditLogWrite,
): Promise<number> {
  const sql = `
    INSERT INTO audit_log
      (action, table_name, record_id, record_ref,
       old_values, new_values,
       actor, user_id, ip_address, user_agent, request_id, source)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id`;

  const params = [
    entry.action,
    entry.table_name,
    entry.record_id ?? null,
    entry.record_ref ?? null,
    entry.old_values != null ? JSON.stringify(entry.old_values) : null,
    entry.new_values != null ? JSON.stringify(entry.new_values) : null,
    entry.actor ?? null,
    entry.user_id ?? null,
    entry.ip_address ?? null,
    entry.user_agent ?? null,
    entry.request_id ?? null,
    entry.source ?? null,
  ];

  const res = await exec.query(sql, params);
  return Number((res.rows[0] as { id: string | number }).id);
}

// ─── Read ───────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: number;
  action: string;
  table_name: string;
  record_id: number | null;
  record_ref: string | null;
  old_values: unknown;
  new_values: unknown;
  actor: string | null;
  user_id: number | null;
  request_id: string | null;
  source: string | null;
  created_at: string;
}

export interface ListAuditLogFilters {
  table_name?: string;
  record_id?: number;
  record_ref?: string;
  action?: string;
  actor?: string;
  limit?: number;
  cursor?: string;
}

export interface ListAuditLogResult {
  items: AuditLogEntry[];
  pagination: { limit: number; cursor: string | null; hasMore: boolean };
}

/** Clamp limit to [1, 200], default 50. Mirrors match-suggestions.ts. */
function clampLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  const safe = Number.isFinite(n) ? n : 50;
  return Math.min(Math.max(Math.trunc(safe), 1), 200);
}

/**
 * List audit_log rows newest-first with optional filters and keyset pagination
 * on (created_at DESC, id DESC).
 */
export async function listAuditLog(
  pool: pg.Pool,
  filters: ListAuditLogFilters,
): Promise<ListAuditLogResult> {
  const limit = clampLimit(filters.limit);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (filters.table_name) {
    conditions.push(`table_name = $${i++}`);
    params.push(filters.table_name);
  }
  if (filters.record_id != null) {
    conditions.push(`record_id = $${i++}`);
    params.push(filters.record_id);
  }
  if (filters.record_ref) {
    conditions.push(`record_ref = $${i++}`);
    params.push(filters.record_ref);
  }
  if (filters.action) {
    conditions.push(`action = $${i++}`);
    params.push(filters.action);
  }
  if (filters.actor) {
    conditions.push(`actor = $${i++}`);
    params.push(filters.actor);
  }

  if (filters.cursor) {
    try {
      const decoded = JSON.parse(
        Buffer.from(filters.cursor, 'base64').toString('utf-8'),
      ) as { created_at: string; id: number };
      conditions.push(
        `(COALESCE(created_at, '-infinity'::timestamptz), id) < (COALESCE($${i++}::timestamptz, '-infinity'::timestamptz), $${i++})`,
      );
      params.push(decoded.created_at, decoded.id);
    } catch {
      // invalid cursor — ignore
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT id, action, table_name, record_id, record_ref,
           old_values, new_values, actor, user_id, request_id,
           source, created_at::text AS created_at
      FROM audit_log
    ${where}
    ORDER BY COALESCE(created_at, '-infinity'::timestamptz) DESC, id DESC
    LIMIT $${i}`;
  params.push(limit + 1);

  const res = await pool.query(sql, params);
  const rows = res.rows as Array<Record<string, unknown>>;

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  const items: AuditLogEntry[] = slice.map((r) => ({
    id: Number(r.id),
    action: r.action as string,
    table_name: r.table_name as string,
    record_id: r.record_id != null ? Number(r.record_id) : null,
    record_ref: (r.record_ref as string) ?? null,
    old_values: r.old_values ?? null,
    new_values: r.new_values ?? null,
    actor: (r.actor as string) ?? null,
    user_id: r.user_id != null ? Number(r.user_id) : null,
    request_id: (r.request_id as string) ?? null,
    source: (r.source as string) ?? null,
    created_at: r.created_at as string,
  }));

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1]!;
    nextCursor = Buffer.from(
      JSON.stringify({ created_at: last.created_at, id: last.id }),
    ).toString('base64');
  }

  return { items, pagination: { limit, cursor: nextCursor, hasMore } };
}
