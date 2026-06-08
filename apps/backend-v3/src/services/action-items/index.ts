import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

export type ActionItemStatus = 'open' | 'in_progress' | 'done';

export type ActionItemPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ActionItemRow {
  id: string;
  title: string;
  detail: string | null;
  owner: string;
  status: ActionItemStatus;
  priority: ActionItemPriority;
  due_date: string | null;
  source: string;
  source_id: string | null;
  source_type: string | null;
  is_auto: boolean;
  assignee_id: number | null;
  linked_record_type: string | null;
  linked_record_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionItemCreateInput {
  title: string;
  detail?: string;
  owner: string;
  priority?: ActionItemPriority;
  source?: string;
  source_id?: string;
  source_type?: string;
  is_auto?: boolean;
  assignee_id?: number;
  due_date?: string;
  linked_record_type?: string;
  linked_record_id?: string;
}

export interface ActionItemUpdateInput {
  status?: ActionItemStatus;
  owner?: string;
  assignee_id?: number | null;
  due_date?: string | null;
  linked_record_type?: string | null;
  linked_record_id?: string | null;
  force?: boolean;
}

export interface ActionItemListFilters {
  status?: string;
  owner?: string;
  source?: string;
  linked_record_type?: string;
  limit: number;
  cursor?: string;
  page?: number;
}

interface AssigneeInfo {
  id: number;
  name: string;
  email: string;
}

const PRIORITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export interface AuditEntry {
  id: string;
  action_item_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  actor: string;
  created_at: string;
}

const TEAM_NAMES = new Set([
  'team', 'all', 'everyone', 'committee', 'group',
]);

function isTeamName(owner: string): boolean {
  return TEAM_NAMES.has(owner.toLowerCase().trim());
}

function buildSourceRef(label: string, itemId: string): object {
  return {
    kind: 'internal' as const,
    title: label,
    url: `/audit/edits/${itemId}`,
    retrieved_at: new Date().toISOString(),
  };
}

export function toApiShape(row: ActionItemRow, drafts: object[] = [], assignee?: AssigneeInfo | null): object {
  const sourceRef = buildSourceRef(
    row.is_auto ? 'Auto-generated' : row.source === 'email' ? 'Email ingest' : 'Manual entry',
    row.id,
  );
  return {
    id: row.id,
    title: row.title,
    title_sources: [sourceRef],
    detail: row.detail,
    detail_sources: row.detail ? [sourceRef] : [],
    owner: row.owner,
    owner_sources: [sourceRef],
    status: row.status,
    priority: row.priority ?? 'MEDIUM',
    due_date: row.due_date,
    due_date_sources: row.due_date ? [sourceRef] : [],
    source: row.source,
    source_type: row.source_type,
    is_auto: row.is_auto ?? false,
    assignee_id: row.assignee_id,
    assignee: assignee ?? null,
    linked_record_type: row.linked_record_type ?? row.source_type,
    linked_record_id: row.linked_record_id ?? row.source_id,
    drafts,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createActionItem(
  input: ActionItemCreateInput,
  actor: string
): Promise<ActionItemRow> {
  if (!input.title || input.title.trim().length === 0) {
    throw Object.assign(new Error('title is required'), { statusCode: 400 });
  }
  if (!input.owner || input.owner.trim().length === 0) {
    throw Object.assign(new Error('owner is required'), { statusCode: 400 });
  }
  if (isTeamName(input.owner)) {
    throw Object.assign(
      new Error('owner must be an individual — team names (team, all, everyone, committee, group) are rejected per Relentless Execution principle'),
      { statusCode: 400 }
    );
  }

  const now = new Date().toISOString();

  const res = await pool.query<ActionItemRow>(
    `INSERT INTO action_items (title, detail, owner, status, priority, due_date, source, source_type, is_auto, assignee_id, linked_record_type, linked_record_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
     RETURNING *`,
    [
      input.title.trim(),
      input.detail?.trim() ?? null,
      input.owner.trim(),
      input.priority ?? 'MEDIUM',
      input.due_date ?? null,
      input.source ?? 'manual',
      input.source_type ?? null,
      input.is_auto ?? false,
      input.assignee_id ?? null,
      input.linked_record_type ?? input.source_type ?? null,
      input.linked_record_id ?? input.source_id ?? null,
      now,
    ]
  );

  const row = res.rows[0]!;

  await logAudit(row.id, 'status', null, 'open', actor);

  logger.info({ actionItemId: row.id, actor }, 'Action item created');
  return row;
}

export async function updateActionItem(
  id: string,
  input: ActionItemUpdateInput,
  actor: string
): Promise<ActionItemRow> {
  const existing = await pool.query<ActionItemRow>(
    'SELECT * FROM action_items WHERE id = $1',
    [id]
  );
  const row = existing.rows[0];
  if (!row) {
    throw Object.assign(new Error('Resource not found'), { statusCode: 404 });
  }

  if (input.owner !== undefined && isTeamName(input.owner)) {
    throw Object.assign(
      new Error('owner must be an individual — team names are rejected per Relentless Execution principle'),
      { statusCode: 400 }
    );
  }

  if (input.status !== undefined) {
    validateStatusTransition(row.status, input.status, input.force ?? false);
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (input.status !== undefined) {
    sets.push(`status = $${idx++}`);
    vals.push(input.status);

    if (input.status === 'done') {
      sets.push(`completed_at = $${idx++}`);
      vals.push(new Date().toISOString());
    }

    await logAudit(id, 'status', row.status, input.status, actor);
  }
  if (input.owner !== undefined) {
    sets.push(`owner = $${idx++}`);
    vals.push(input.owner.trim());
    await logAudit(id, 'owner', row.owner, input.owner.trim(), actor);
  }
  if (input.assignee_id !== undefined) {
    sets.push(`assignee_id = $${idx++}`);
    vals.push(input.assignee_id);
    await logAudit(id, 'assignee_id', String(row.assignee_id), String(input.assignee_id), actor);
  }
  if (input.due_date !== undefined) {
    sets.push(`due_date = $${idx++}`);
    vals.push(input.due_date);
    await logAudit(id, 'due_date', row.due_date, input.due_date, actor);
  }
  if (input.linked_record_type !== undefined) {
    sets.push(`linked_record_type = $${idx++}`);
    vals.push(input.linked_record_type);
  }
  if (input.linked_record_id !== undefined) {
    sets.push(`linked_record_id = $${idx++}`);
    vals.push(input.linked_record_id);
  }

  if (sets.length === 0) {
    return row;
  }

  sets.push(`updated_at = $${idx++}`);
  vals.push(new Date().toISOString());
  vals.push(id);

  const result = await pool.query<ActionItemRow>(
    `UPDATE action_items SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals
  );

  logger.info({ actionItemId: id, actor }, 'Action item updated');
  return result.rows[0]!;
}

export async function listActionItems(
  filters: ActionItemListFilters
): Promise<{ items: ActionItemRow[]; hasMore: boolean; cursor: string | null; total?: number; page?: number; totalPages?: number }> {
  const conditions: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (filters.status === 'overdue') {
    conditions.push(`status NOT IN ('done')`);
    conditions.push(`due_date < NOW()`);
  } else if (filters.status) {
    conditions.push(`status = $${idx++}`);
    vals.push(filters.status);
  }
  if (filters.owner) {
    conditions.push(`owner = $${idx++}`);
    vals.push(filters.owner);
  }
  if (filters.source) {
    conditions.push(`source = $${idx++}`);
    vals.push(filters.source);
  }
  if (filters.linked_record_type) {
    conditions.push(`linked_record_type = $${idx++}`);
    vals.push(filters.linked_record_type);
  }

  // --- Offset/page mode (mirrors Opportunities) ---
  if (filters.page) {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const page = Math.max(filters.page, 1);
    const offset = (page - 1) * limit;

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM action_items ${where}`,
      vals,
    );
    const total = countRes.rows[0]?.total ?? 0;
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    const dataVals = [...vals, limit, offset];
    const res = await pool.query<ActionItemRow>(
      `SELECT * FROM action_items ${where}
       ORDER BY
         CASE priority
           WHEN 'CRITICAL' THEN 0
           WHEN 'HIGH'     THEN 1
           WHEN 'MEDIUM'   THEN 2
           WHEN 'LOW'      THEN 3
           ELSE 4
         END,
         due_date ASC NULLS LAST,
         created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      dataVals,
    );

    return { items: res.rows, hasMore: page < totalPages, cursor: null, total, page, totalPages };
  }

  // --- Existing cursor mode (unchanged) ---
  if (filters.cursor) {
    conditions.push(`id < $${idx++}`);
    vals.push(filters.cursor);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit, 1), 200);
  vals.push(limit + 1);

  const res = await pool.query<ActionItemRow>(
    `SELECT * FROM action_items ${where}
     ORDER BY
       CASE priority
         WHEN 'CRITICAL' THEN 0
         WHEN 'HIGH'     THEN 1
         WHEN 'MEDIUM'   THEN 2
         WHEN 'LOW'      THEN 3
         ELSE 4
       END,
       due_date ASC NULLS LAST,
       created_at DESC
     LIMIT $${idx}`,
    vals
  );

  const hasMore = res.rows.length > limit;
  const items = hasMore ? res.rows.slice(0, limit) : res.rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

  return { items, hasMore, cursor: nextCursor };
}

export async function getActionItem(id: string): Promise<ActionItemRow | null> {
  const res = await pool.query<ActionItemRow>(
    'SELECT * FROM action_items WHERE id = $1',
    [id]
  );
  return res.rows[0] ?? null;
}

function validateStatusTransition(
  current: ActionItemStatus,
  next: ActionItemStatus,
  force: boolean
): void {
  if (current === next) return;

  if (current === 'done' && !force) {
    throw Object.assign(
      new Error('Cannot reopen a done action item without force: true'),
      { statusCode: 400 }
    );
  }

  const VALID_TRANSITIONS: Record<ActionItemStatus, ActionItemStatus[]> = {
    open: ['in_progress', 'done'],
    in_progress: ['done'],
    done: ['open', 'in_progress'],
  };

  if (!VALID_TRANSITIONS[current]?.includes(next)) {
    throw Object.assign(
      new Error(`Invalid status transition: ${current} → ${next}`),
      { statusCode: 400 }
    );
  }
}

export async function getTopActionItems(limit: number = 5): Promise<ActionItemRow[]> {
  const res = await pool.query<ActionItemRow>(
    `SELECT * FROM action_items
     WHERE status NOT IN ('done')
     ORDER BY
       CASE priority
         WHEN 'CRITICAL' THEN 0
         WHEN 'HIGH'     THEN 1
         WHEN 'MEDIUM'   THEN 2
         WHEN 'LOW'      THEN 3
         ELSE 4
       END,
       due_date ASC NULLS LAST,
       created_at DESC
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 20)]
  );
  return res.rows;
}

export async function getAssignee(assigneeId: number | null): Promise<AssigneeInfo | null> {
  if (!assigneeId) return null;
  const res = await pool.query<{ id: number; display_name: string; email: string }>(
    'SELECT id, display_name, email FROM users WHERE id = $1',
    [assigneeId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return { id: row.id, name: row.display_name, email: row.email };
}

export async function getAdminUserId(): Promise<number | null> {
  const res = await pool.query<{ id: number }>(
    "SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE ORDER BY created_at ASC LIMIT 1"
  );
  return res.rows[0]?.id ?? null;
}

export async function findExistingAutoItem(
  sourceType: string,
  sourceId: string,
  titlePrefix: string
): Promise<boolean> {
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM action_items
     WHERE source_type = $1
       AND linked_record_id = $2
       AND title LIKE $3
       AND status NOT IN ('done')
       AND is_auto = TRUE`,
    [sourceType, sourceId, `${titlePrefix}%`]
  );
  return parseInt(res.rows[0]?.count ?? '0', 10) > 0;
}

async function logAudit(
  actionItemId: string,
  field: string,
  oldValue: string | null,
  newValue: string | null,
  actor: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO action_item_audit (action_item_id, field, old_value, new_value, actor, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actionItemId, field, oldValue, newValue, actor, new Date().toISOString()]
    );
  } catch (err) {
    logger.warn({ err, actionItemId, field }, 'Failed to write audit log');
  }
}
