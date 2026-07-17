/**
 * F-310: Action Item Draft Worker
 *
 * Subscribes to: action-item-draft
 *
 * On action item creation, generates an AI draft using the llmRouter.
 * When F-300 (RAG) is available, this worker will use it for context.
 * Until then, uses claude-haiku to produce a best-effort draft.
 *
 * Every draft carries R1 evidence citations.
 * If insufficient context, sets draft_status = 'no_context'.
 */

import PgBoss from 'pg-boss';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { QUEUE_NAMES, registerQueues } from '../lib/queue.js';
import { llmRouter } from '../lib/llm-router.js';
import {
  getActionItem,
  updateDraft,
  type ActionItemRow,
} from '../services/action-items/index.js';
import type { ActionItemDraftOutput } from '../lib/llm-router.types.js';

export interface DraftGenerationJobData {
  actionItemId: string;
}

function buildEvidenceRefs(actionItem: ActionItemRow): object[] {
  const refs: object[] = [];
  const now = new Date().toISOString();

  refs.push({
    kind: 'internal',
    title: actionItem.is_auto ? 'Auto-generated action item' : 'User-created action item',
    url: `/action-items?id=${actionItem.id}`,
    retrieved_at: now,
  });

  if (actionItem.capture_id) {
    refs.push({
      kind: 'internal',
      title: `Capture ${actionItem.capture_id}`,
      url: `/capture?opp=${actionItem.capture_id}`,
      retrieved_at: now,
    });
  }

  if (actionItem.award_id) {
    refs.push({
      kind: 'internal',
      title: `Award ${actionItem.award_id}`,
      url: `/awards?id=${actionItem.award_id}`,
      retrieved_at: now,
    });
  }

  return refs;
}

function buildStubDraft(actionItem: ActionItemRow): { text: string; evidenceRefs: object[] } {
  const evidenceRefs = buildEvidenceRefs(actionItem);
  const ds = actionItem.doctrine_source ?? 'manual';
  const parts: string[] = [];

  switch (ds) {
    case 'capture_review_killitem':
      parts.push(`Regarding: ${actionItem.title}`);
      parts.push('');
      parts.push('This kill-item was flagged during a capture review. Recommended actions:');
      parts.push('1. Review the specific gap or deficiency identified');
      parts.push('2. Assess whether the gap can be mitigated with current resources');
      parts.push('3. If not, evaluate teaming options or de-scope strategy');
      if (actionItem.detail) parts.push(`\nContext: ${actionItem.detail}`);
      parts.push(`\nSource: Capture review action item (${actionItem.doctrine_source})`);
      break;

    case 'capture_stale':
      parts.push(`Regarding: ${actionItem.title}`);
      parts.push('');
      parts.push('This capture has been stale for more than 14 days. Recommended actions:');
      parts.push('1. Confirm the opportunity is still active (check SAM)');
      parts.push('2. Schedule a color team review if one has not been held recently');
      parts.push('3. Update the capture plan with latest intelligence');
      if (actionItem.detail) parts.push(`\nContext: ${actionItem.detail}`);
      break;

    case 'capture_deadline':
      parts.push(`Regarding: ${actionItem.title}`);
      parts.push('');
      parts.push('A capture deadline is approaching. Recommended actions:');
      parts.push('1. Verify all required documents are in progress');
      parts.push('2. Confirm pricing strategy is finalized');
      parts.push('3. Schedule final review before submission');
      if (actionItem.due_date) parts.push(`\nDeadline: ${actionItem.due_date}`);
      if (actionItem.detail) parts.push(`\nContext: ${actionItem.detail}`);
      break;

    case 'recompete_expiring':
      parts.push(`Regarding: ${actionItem.title}`);
      parts.push('');
      parts.push('A contract is approaching its re-compete window. Recommended actions:');
      parts.push('1. Assess current performance and customer relationships');
      parts.push('2. Identify competitive landscape changes since last award');
      parts.push('3. Begin capture planning if not already underway');
      if (actionItem.detail) parts.push(`\nContext: ${actionItem.detail}`);
      break;

    default:
      parts.push(`Regarding: ${actionItem.title}`);
      parts.push('');
      if (actionItem.detail) {
        parts.push(actionItem.detail);
        parts.push('');
      }
      parts.push('Suggested next steps:');
      parts.push('1. Review the action item requirements');
      parts.push('2. Identify required resources and timeline');
      parts.push('3. Assign specific deliverables and deadlines');
      break;
  }

  return { text: parts.join('\n'), evidenceRefs };
}

async function generateDraft(actionItem: ActionItemRow): Promise<void> {
  const itemId = actionItem.id;

  try {
    const result = await llmRouter.route<'action_item_draft'>({
      task: 'action_item_draft',
      input: {
        action_item_id: itemId,
        title: actionItem.title,
        detail: actionItem.detail,
        owner: actionItem.owner,
        priority: actionItem.priority,
        doctrine_source: actionItem.doctrine_source ?? 'manual',
        due_date: actionItem.due_date,
        linked_record_type: actionItem.linked_record_type,
        linked_record_id: actionItem.linked_record_id,
      },
      opts: {
        operator_id: 'system',
        object_ref: `action-item-${itemId}`,
        disable_router_retry: true,
      },
    });

    if (result.ok) {
      const output = result.output as ActionItemDraftOutput;
      if (!output.has_sufficient_context) {
        await updateDraft(
          itemId,
          output.no_context_reason ?? 'Insufficient context for draft generation',
          [],
          'no_context',
        );
        logger.info({ actionItemId: itemId }, 'Draft generation: no context');
        return;
      }

      const evidenceRefs = output.evidence_refs.map((ref) => ({
        kind: ref.kind,
        title: ref.title,
        url: ref.url,
        retrieved_at: ref.retrieved_at,
      }));

      await updateDraft(itemId, output.draft_text, evidenceRefs, 'ready');
      logger.info({ actionItemId: itemId }, 'Draft generated via LLM');
      return;
    }

    // LLM failed — fall back to stub draft
    logger.warn(
      { actionItemId: itemId, error: result.error_message },
      'LLM draft generation failed, using stub'
    );
  } catch (err) {
    logger.warn({ err, actionItemId: itemId }, 'LLM draft generation error, using stub');
  }

  // Stub fallback
  const stub = buildStubDraft(actionItem);
  await updateDraft(itemId, stub.text, stub.evidenceRefs, 'ready');
  logger.info({ actionItemId: itemId }, 'Draft generated via stub fallback');
}

async function handleDraftJob(job: PgBoss.Job<DraftGenerationJobData>): Promise<void> {
  const { actionItemId } = job.data;

  const actionItem = await getActionItem(actionItemId);
  if (!actionItem) {
    logger.warn({ actionItemId }, 'Action item not found for draft generation');
    return;
  }

  // Skip if draft already generated
  if (actionItem.draft_status && actionItem.draft_status !== 'pending') {
    logger.info({ actionItemId, status: actionItem.draft_status }, 'Draft already processed, skipping');
    return;
  }

  await generateDraft(actionItem);
}

async function handleDraftJobs(jobs: PgBoss.Job<DraftGenerationJobData>[]): Promise<void> {
  for (const job of jobs) {
    try {
      await handleDraftJob(job);
    } catch (err) {
      logger.error({ err, jobId: job.id }, 'Draft generation job failed');
      throw err;
    }
  }
}

export async function startActionItemDraftWorker(): Promise<void> {
  const boss = new PgBoss({
    connectionString: config.databaseUrl,
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
    expireInHours: 1,
    archiveCompletedAfterSeconds: 3600,
    deleteAfterDays: 7,
  });

  boss.on('error', (err) => {
    logger.error({ err }, 'action-item-draft worker pg-boss error');
  });

  await boss.start();
  await registerQueues(boss);

  await boss.work<DraftGenerationJobData>(
    QUEUE_NAMES.ACTION_ITEM_DRAFT,
    { batchSize: 2 },
    handleDraftJobs,
  );

  logger.info('Action item draft worker started');
}
