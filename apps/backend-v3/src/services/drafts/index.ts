import { pool } from '../../lib/db.js';
import { requireBoss, QUEUE_NAMES } from '../../lib/queue.js';
import { logger } from '../../lib/logger.js';
import type { ActionItemRow } from '../action-items/index.js';

export type DraftKind = 'reply' | 'research' | 'milestone';
export type DraftDbStatus = 'pending' | 'approved' | 'rejected';
export type DraftLifecycleStatus = 'generating' | 'done' | 'failed';

export interface DraftRow {
  id: number;
  action_item_id: number;
  kind: DraftKind;
  content: string;
  model_used: string | null;
  approved_by: string | null;
  approved_at: string | null;
  source_id: number;
  status: DraftDbStatus;
  evidence_ids: string[] | null;
  rejection_reason: string | null;
  edit_diff: string | null;
  original_content: string | null;
  created_at: string;
}

export interface DraftJobData {
  draftId: number;
  actionItemId: string;
  kind: DraftKind;
}

const VALID_KINDS = new Set<string>(['reply', 'research', 'milestone']);

export function isDraftKind(value: string): value is DraftKind {
  return VALID_KINDS.has(value);
}

export async function requestDraft(
  actionItem: ActionItemRow,
  kind: DraftKind
): Promise<DraftRow> {
  const res = await pool.query<DraftRow>(
    `INSERT INTO action_item_drafts (action_item_id, kind, status, content, source_id, created_at)
     VALUES ($1, $2, 'pending', '', $3, NOW())
     RETURNING *`,
    [actionItem.id, kind, actionItem.source_id]
  );

  const draft = res.rows[0]!;

  const boss = requireBoss();
  const jobData: DraftJobData = {
    draftId: draft.id,
    actionItemId: actionItem.id,
    kind,
  };
  await boss.send(QUEUE_NAMES.INGEST_POSTPROCESS, jobData, {
    priority: 1,
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    singletonKey: `draft-${draft.id}`,
  });

  logger.info({ draftId: draft.id, actionItemId: actionItem.id, kind }, 'Draft requested');
  return draft;
}

export async function getDraft(draftId: string): Promise<DraftRow | null> {
  const res = await pool.query<DraftRow>(
    'SELECT * FROM action_item_drafts WHERE id = $1',
    [draftId]
  );
  return res.rows[0] ?? null;
}

export async function getDraftsByActionItem(actionItemId: string): Promise<DraftRow[]> {
  const res = await pool.query<DraftRow>(
    'SELECT * FROM action_item_drafts WHERE action_item_id = $1 ORDER BY created_at DESC',
    [actionItemId]
  );
  return res.rows;
}

export function buildStubDraftText(kind: DraftKind, actionItem: ActionItemRow): string {
  switch (kind) {
    case 'reply':
      return `Draft reply for: ${actionItem.title}\n\nHi,\n\nFollowing up on "${actionItem.title}". ${actionItem.detail ? `Context: ${actionItem.detail}` : 'Please advise on next steps.'}\n\nBest regards`;
    case 'research':
      return `Research outline for: ${actionItem.title}\n\n1. Key questions:\n   - What is the current status?\n   - What resources are available?\n   - What are the risks?\n\n2. Sources to consult:\n   - Internal knowledge base\n   - SAM.gov\n   - GovTribe\n\n3. Timeline considerations:\n   - ${actionItem.due_date ? `Due by: ${actionItem.due_date}` : 'No due date set'}`;
    case 'milestone':
      return `Milestone summary for: ${actionItem.title}\n\nObjective: ${actionItem.title}\nStatus: ${actionItem.status}\n${actionItem.due_date ? `Target date: ${actionItem.due_date}` : ''}\n\nKey accomplishments:\n- Task identified and tracked\n\nNext steps:\n- Review and validate requirements\n- Assign resources\n- Execute and report`;
  }
}

export function buildDraftSources(kind: DraftKind): object[] {
  return [
    {
      kind: 'internal',
      title: `AI draft (${kind}) — stub model`,
      url: '/audit/drafts/stub',
      retrieved_at: new Date().toISOString(),
    },
  ];
}

export function lifecycleStatus(row: DraftRow): DraftLifecycleStatus {
  if (row.status === 'rejected') return 'failed';
  if (row.content && row.content.length > 0) return 'done';
  return 'generating';
}

export function toDraftApiShape(row: DraftRow): object {
  return {
    id: row.id,
    action_item_id: row.action_item_id,
    kind: row.kind,
    content: row.content,
    model_used: row.model_used,
    status: lifecycleStatus(row),
    evidence_ids: row.evidence_ids ?? [],
    rejection_reason: row.rejection_reason ?? null,
    edit_diff: row.edit_diff ?? null,
    original_content: row.original_content ?? null,
    created_at: row.created_at,
  };
}

export async function approveDraft(
  draftId: string,
  actor: string,
): Promise<DraftRow> {
  const res = await pool.query<DraftRow>(
    `UPDATE action_item_drafts
     SET status = 'approved', approved_by = $1, approved_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [actor, draftId],
  );
  const row = res.rows[0];
  if (!row) throw Object.assign(new Error('Draft not found'), { statusCode: 404 });

  await pool.query(
    `UPDATE action_items SET draft_status = 'approved', updated_at = NOW() WHERE id = $1`,
    [row.action_item_id],
  );

  logger.info({ draftId, actor }, 'Draft approved');
  return row;
}

export async function rejectDraft(
  draftId: string,
  reason: string,
  actor: string,
): Promise<DraftRow> {
  const res = await pool.query<DraftRow>(
    `UPDATE action_item_drafts
     SET status = 'rejected', rejection_reason = $1
     WHERE id = $2
     RETURNING *`,
    [reason, draftId],
  );
  const row = res.rows[0];
  if (!row) throw Object.assign(new Error('Draft not found'), { statusCode: 404 });

  await pool.query(
    `UPDATE action_items SET draft_status = 'rejected', updated_at = NOW() WHERE id = $1`,
    [row.action_item_id],
  );

  logger.info({ draftId, reason, actor }, 'Draft rejected');
  return row;
}

export async function editDraft(
  draftId: string,
  newContent: string,
  actor: string,
): Promise<DraftRow> {
  const existing = await getDraft(draftId);
  if (!existing) throw Object.assign(new Error('Draft not found'), { statusCode: 404 });

  const originalContent = existing.original_content ?? existing.content;
  const editDiff = computeSimpleDiff(originalContent, newContent);

  const res = await pool.query<DraftRow>(
    `UPDATE action_item_drafts
     SET content = $1, original_content = $2, edit_diff = $3, approved_by = $4, approved_at = NOW(), status = 'approved'
     WHERE id = $5
     RETURNING *`,
    [newContent, originalContent, editDiff, actor, draftId],
  );
  const row = res.rows[0]!;

  await pool.query(
    `UPDATE action_items SET draft_text = $1, draft_status = 'approved', updated_at = NOW() WHERE id = $2`,
    [newContent, row.action_item_id],
  );

  logger.info({ draftId, actor, diffLen: editDiff.length }, 'Draft edited');
  return row;
}

function computeSimpleDiff(original: string, edited: string): string {
  const origLines = original.split('\n');
  const editLines = edited.split('\n');
  const diffs: string[] = [];
  const maxLen = Math.max(origLines.length, editLines.length);
  for (let i = 0; i < maxLen; i++) {
    const origLine = origLines[i] ?? '';
    const editLine = editLines[i] ?? '';
    if (origLine !== editLine) {
      if (origLine) diffs.push(`- ${origLine}`);
      if (editLine) diffs.push(`+ ${editLine}`);
    }
  }
  return diffs.join('\n');
}
