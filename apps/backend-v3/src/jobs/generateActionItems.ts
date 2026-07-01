/**
 * generateActionItems.ts — Auto-generation job (runs every 6 hours)
 *
 * Scans opportunities, risks, and awards to create action items for
 * conditions that demand attention. Deduplicates against existing open
 * items so no duplicate entries are created.
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import {
  createActionItem,
  findExistingAutoItem,
  getAdminUserId,
  type ActionItemPriority,
} from '../services/action-items/index.js';

interface GeneratedItem {
  title: string;
  description: string;
  dueDate: string | null;
  priority: ActionItemPriority;
  sourceType: string;
  sourceId: string;
}

export async function generateActionItems(): Promise<void> {
  const startMs = Date.now();
  logger.info('[action-items-gen] starting auto-generation run');

  const adminId = await getAdminUserId();
  const items: GeneratedItem[] = [];

  const [oppItems, pwinItems, riskItems, awardItems] = await Promise.all([
    findOpportunityDeadlineItems(),
    findHighPwinItems(),
    findUnownedRiskItems(),
    findRecompeteItems(),
  ]);

  items.push(...oppItems, ...pwinItems, ...riskItems, ...awardItems);

  let created = 0;
  let skipped = 0;

  for (const item of items) {
    const titlePrefix = item.title.substring(0, 60);
    const exists = await findExistingAutoItem(item.sourceType, item.sourceId, titlePrefix);
    if (exists) {
      skipped++;
      continue;
    }

    try {
      await createActionItem(
        {
          title: item.title,
          detail: item.description,
          owner: 'system',
          priority: item.priority,
          due_date: item.dueDate ?? undefined,
          source: 'auto',
          source_id: item.sourceId,
          source_type: item.sourceType,
          is_auto: true,
          assignee_id: adminId ?? undefined,
          linked_record_type: item.sourceType,
          linked_record_id: item.sourceId,
        },
        'system',
      );
      created++;
    } catch (err) {
      logger.warn(
        { err, title: item.title, sourceType: item.sourceType },
        '[action-items-gen] failed to create item',
      );
    }
  }

  const elapsed = Date.now() - startMs;
  logger.info(
    { created, skipped, total: items.length, elapsed_ms: elapsed },
    '[action-items-gen] completed',
  );
}

/* ── Condition 1: Opportunity closing within 30 days, no capture ─── */

async function findOpportunityDeadlineItems(): Promise<GeneratedItem[]> {
  const res = await pool.query<{
    id: string;
    title: string;
    response_due_at: string;
    days_left: number;
  }>(`
    SELECT o.id::TEXT, o.title, o.response_due_at,
           EXTRACT(DAY FROM o.response_due_at - NOW())::INT AS days_left
    FROM opportunities o
    WHERE o.response_due_at IS NOT NULL
      AND o.response_due_at > NOW()
      AND o.response_due_at <= NOW() + INTERVAL '30 days'
      AND o.status NOT IN ('no_bid', 'closed', 'awarded')
      AND o.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM pipeline_items pi
        JOIN captures c ON c.pipeline_item_id = pi.id
        WHERE pi.opportunity_id = o.id
      )
  `);

  return res.rows.map((r) => ({
    title: `Opportunity ${r.title} closes in ${r.days_left} days — no capture started`,
    description: `${r.title} has a response deadline of ${new Date(r.response_due_at).toLocaleDateString('en-US')} with no associated capture record.`,
    dueDate: r.response_due_at,
    priority: r.days_left <= 7 ? 'CRITICAL' as const : 'HIGH' as const,
    sourceType: 'opportunity',
    sourceId: String(r.id),
  }));
}

/* ── Condition 2: Pwin > 60, no pipeline stage ─────────────────── */

async function findHighPwinItems(): Promise<GeneratedItem[]> {
  const res = await pool.query<{
    internal_id: string;
    title: string;
    pwin: number;
  }>(`
    SELECT uo.internal_id::TEXT, uo.title, uo.pwin
    FROM unified_opportunities uo
    WHERE uo.pwin > 60
      AND NOT EXISTS (
        SELECT 1 FROM pipeline_items pi
        JOIN opportunities o ON o.id = pi.opportunity_id
        JOIN unified_opportunity_links uol ON uol.source_native_id = o.id::TEXT
        WHERE uol.internal_id = uo.internal_id
      )
  `);

  return res.rows.map((r) => ({
    title: `High-probability opportunity ${r.title ?? 'Untitled'} not in pipeline`,
    description: `${r.title ?? 'Untitled'} has a PWin of ${r.pwin}% but is not assigned to any pipeline stage.`,
    dueDate: null,
    priority: 'HIGH' as const,
    sourceType: 'opportunity',
    sourceId: String(r.internal_id),
  }));
}

/* ── Condition 3: Unowned HIGH/CRITICAL-severity risks ─────────── */

async function findUnownedRiskItems(): Promise<GeneratedItem[]> {
  const res = await pool.query<{
    id: string;
    title: string;
    severity: string;
  }>(`
    SELECT id::TEXT, title, severity
    FROM risks
    WHERE owner IS NULL
      AND severity IN ('critical', 'high')
      AND status NOT IN ('resolved', 'accepted', 'closed')
  `);

  return res.rows.map((r) => ({
    title: `Unowned critical risk: ${r.title}`,
    description: `Risk "${r.title}" has severity "${r.severity}" and no mitigation owner assigned.`,
    dueDate: null,
    priority: r.severity === 'critical' ? 'CRITICAL' as const : 'HIGH' as const,
    sourceType: 'risk',
    sourceId: String(r.id),
  }));
}

/* ── Condition 4: Recompete candidates with no capture ─────────── */

async function findRecompeteItems(): Promise<GeneratedItem[]> {
  const res = await pool.query<{
    id: string;
    awardee_name: string;
    piid: string;
    period_of_performance_end: string | null;
  }>(`
    SELECT a.id::TEXT, a.awardee_name, a.piid, a.period_of_performance_end
    FROM awards a
    WHERE a.is_recompete_candidate = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM pipeline_items pi
        JOIN opportunities o ON o.id = pi.opportunity_id
        WHERE o.sam_notice_id = a.sam_notice_id
      )
  `);

  return res.rows.map((r) => {
    const expiry = r.period_of_performance_end
      ? ` expires ${new Date(r.period_of_performance_end).toLocaleDateString('en-US')}`
      : '';
    return {
      title: `Re-compete window opening: ${r.awardee_name ?? r.piid}${expiry}`,
      description: `Award ${r.piid} (${r.awardee_name ?? 'unknown recipient'}) is a recompete candidate with no associated capture record.`,
      dueDate: r.period_of_performance_end,
      priority: 'HIGH' as const,
      sourceType: 'award',
      sourceId: String(r.id),
    };
  });
}
