import { pool } from '../../lib/db.js';

export type CitationKind = 'internal_query' | 'internal_event' | 'external_upstream';

export interface SourceCitation {
  kind: CitationKind;
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

export async function computeSummary(): Promise<LaunchpadSummary> {
  const retrievedAt = new Date().toISOString();

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
    qualified_due_this_week_sources: [{
      kind: 'internal_query',
      title: 'Opportunities (qualified, due this week)',
      url: '/opportunities?status=qualified&due=this_week',
      retrieved_at: retrievedAt,
    }],
    pipeline_no_capture: parseInt(pipelineNoCaptureRes.rows[0]?.count ?? '0', 10),
    pipeline_no_capture_sources: [{
      kind: 'internal_query',
      title: 'Pipeline items missing a capture record',
      url: '/pipeline?missing_capture=1',
      retrieved_at: retrievedAt,
    }],
    captures_color_review_stale: parseInt(staleReviewRes.rows[0]?.count ?? '0', 10),
    captures_color_review_stale_sources: [{
      kind: 'internal_query',
      title: 'Captures with color review > 14 days old',
      url: '/capture?stale=1',
      retrieved_at: retrievedAt,
    }],
    action_items_open_today: parseInt(openTodayRes.rows[0]?.count ?? '0', 10),
    action_items_open_today_sources: [{
      kind: 'internal_query',
      title: 'Action items open with due_date = today',
      url: '/action-items?due=today',
      retrieved_at: retrievedAt,
    }],
    action_items_overdue: parseInt(overdueRes.rows[0]?.count ?? '0', 10),
    action_items_overdue_sources: [{
      kind: 'internal_query',
      title: 'Action items open and past due',
      url: '/action-items?overdue=1',
      retrieved_at: retrievedAt,
    }],
  };
}
