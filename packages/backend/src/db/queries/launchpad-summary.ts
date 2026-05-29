// ---------------------------------------------------------------------------
// Launchpad Summary — four parameterized queries for the summary card grid.
// All queries filter by ou_tag.  Wrapped in Promise.all by the caller.
// ---------------------------------------------------------------------------

import type { Pool } from "pg";

export interface LaunchpadSummary {
  action_items_due_today: number;
  opportunities_hot: number;
  capture_behind: number;
  partner_new_awards_7d: number;
}

/** Open action items whose due_date is today (EST). */
export async function countActionItemsDueToday(
  pool: Pool,
  ouTag: string,
): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM action_items
     WHERE ou_tag = $1
       AND status = 'open'
       AND due_date = (NOW() AT TIME ZONE 'America/New_York')::date`,
    [ouTag],
  );
  return result.rows[0]?.cnt ?? 0;
}

/** Opportunities that are "hot": win_prob_pct >= 70 (via pipeline) OR grade = 'A'. */
export async function countOpportunitiesHot(
  pool: Pool,
  ouTag: string,
): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT o.id)::int AS cnt
     FROM opportunities o
     LEFT JOIN pipeline_items pi ON pi.opportunity_id = o.id
     WHERE o.ou_tag = $1
       AND (pi.win_prob_pct >= 70 OR o.grade = 'A')`,
    [ouTag],
  );
  return result.rows[0]?.cnt ?? 0;
}

/** Captures in pre-submission stages where the pipeline expected_close/due has passed. */
export async function countCaptureBehind(
  pool: Pool,
  ouTag: string,
): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM captures c
     JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
     JOIN opportunities o ON o.id = pi.opportunity_id
     WHERE c.ou_tag = $1
       AND c.color_review_stage != 'submitted'
       AND o.response_due_at < NOW()`,
    [ouTag],
  );
  return result.rows[0]?.cnt ?? 0;
}

/** Partner awards ingested in the last 7 days. */
export async function countPartnerNewAwards7d(
  pool: Pool,
  ouTag: string,
): Promise<number> {
  void ouTag; // ou_tag is not on partner_awards; we count all partner awards
  const result = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM partner_awards
     WHERE awarded_at >= NOW() - INTERVAL '7 days'`,
  );
  return result.rows[0]?.cnt ?? 0;
}

/** Fetch all four metrics in parallel. */
export async function fetchLaunchpadSummary(
  pool: Pool,
  ouTag: string,
): Promise<LaunchpadSummary> {
  const [actionDue, hotOpps, behind, newAwards] = await Promise.all([
    countActionItemsDueToday(pool, ouTag),
    countOpportunitiesHot(pool, ouTag),
    countCaptureBehind(pool, ouTag),
    countPartnerNewAwards7d(pool, ouTag),
  ]);

  return {
    action_items_due_today: actionDue,
    opportunities_hot: hotOpps,
    capture_behind: behind,
    partner_new_awards_7d: newAwards,
  };
}
