import { pool } from '../../lib/db.js';

export interface SourceCitation {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

export interface LaunchpadSummary {
  qualified_due_this_week: number;
  qualified_due_this_week_sources: SourceCitation[];
  pipeline_no_capture: number;
  pipeline_no_capture_sources: SourceCitation[];
  captures_color_review_stale: number;
  captures_color_review_stale_sources: SourceCitation[];
  action_items_open_today: number;
  action_items_open_today_sources: SourceCitation[];
  action_items_overdue: number;
  action_items_overdue_sources: SourceCitation[];
}

const INTERNAL_SOURCE: SourceCitation = {
  kind: 'internal',
  title: 'GDA Command V3 — computed count',
  url: '/v3/launchpad/summary',
  retrieved_at: new Date().toISOString(),
};

function internalCitation(filterUrl: string): SourceCitation[] {
  return [{ ...INTERNAL_SOURCE, url: filterUrl, retrieved_at: new Date().toISOString() }];
}

export async function computeSummary(): Promise<LaunchpadSummary> {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const [qualifiedRes, pipelineNoCaptureRes, staleReviewRes, openTodayRes, overdueRes] =
    await Promise.all([
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM opportunities
         WHERE status = 'qualified'
           AND deleted_at IS NULL
           AND response_due_at >= $1
           AND response_due_at < $2`,
        [startOfWeek.toISOString(), endOfWeek.toISOString()]
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM pipeline_items pi
         WHERE NOT EXISTS (
           SELECT 1 FROM captures c WHERE c.pipeline_item_id = pi.id
         )`
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM captures
         WHERE updated_at < NOW() - INTERVAL '14 days'`
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM action_items
         WHERE status = 'open'
           AND due_date IS NOT NULL
           AND due_date::date = CURRENT_DATE`
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM action_items
         WHERE status = 'open'
           AND due_date IS NOT NULL
           AND due_date < NOW()`
      ),
    ]);

  return {
    qualified_due_this_week: parseInt(qualifiedRes.rows[0]?.count ?? '0', 10),
    qualified_due_this_week_sources: internalCitation('/v3/opportunities?status=qualified&due_before=' + endOfWeek.toISOString().split('T')[0]),
    pipeline_no_capture: parseInt(pipelineNoCaptureRes.rows[0]?.count ?? '0', 10),
    pipeline_no_capture_sources: internalCitation('/v3/pipeline?no_capture=1'),
    captures_color_review_stale: parseInt(staleReviewRes.rows[0]?.count ?? '0', 10),
    captures_color_review_stale_sources: internalCitation('/v3/captures?stale_review=1'),
    action_items_open_today: parseInt(openTodayRes.rows[0]?.count ?? '0', 10),
    action_items_open_today_sources: internalCitation('/v3/action-items?status=open&due=today'),
    action_items_overdue: parseInt(overdueRes.rows[0]?.count ?? '0', 10),
    action_items_overdue_sources: internalCitation('/v3/action-items?status=open&overdue=1'),
  };
}
