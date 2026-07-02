/**
 * Door Summaries service — F-308
 *
 * Generates one-paragraph summaries per door, cached 1h in launchpad_door_summaries.
 * Returns cached summaries when still fresh, regenerates via SQL aggregation otherwise.
 */

import { pool } from '../../lib/db.js';

export interface DoorSummary {
  door_key: string;
  door_label: string;
  summary: string;
  generated_at: string;
}

export interface DoorSummariesResult {
  summaries: DoorSummary[];
  generated_at: string;
}

const DOORS: Array<{ key: string; label: string }> = [
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'capture', label: 'Capture' },
  { key: 'action_items', label: 'Action Items' },
  { key: 'partner_intel', label: 'Partner Intel' },
  { key: 'risks', label: 'Risks' },
  { key: 'sentinel', label: 'Sentinel' },
];

async function generateSummary(doorKey: string): Promise<string> {
  switch (doorKey) {
    case 'opportunities': {
      const res = await pool.query<{
        total: string;
        qualified: string;
        forecast: string;
        new_24h: string;
      }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE status = 'qualified')::text AS qualified,
           COUNT(*) FILTER (WHERE lifecycle_stage = 'forecast')::text AS forecast,
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::text AS new_24h
         FROM unified_opportunities
         WHERE deleted_at IS NULL`,
      );
      const r = res.rows[0];
      return `${r?.total ?? 0} tracked opportunities. ${r?.qualified ?? 0} qualified, ${r?.forecast ?? 0} in forecast stage. ${r?.new_24h ?? 0} new in last 24h.`;
    }
    case 'pipeline': {
      const res = await pool.query<{
        total: string;
        stalled: string;
        total_value: string;
      }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE days_in_stage > 30)::text AS stalled,
           COALESCE(SUM(value_cents), 0)::text AS total_value
         FROM pipeline_items`,
      );
      const r = res.rows[0];
      const val = Number(r?.total_value ?? 0) / 100;
      return `${r?.total ?? 0} pipeline items worth $${(val / 1e6).toFixed(1)}M. ${r?.stalled ?? 0} stalled (>30 days in stage).`;
    }
    case 'capture': {
      const res = await pool.query<{
        total: string;
        active: string;
        stale: string;
      }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE stage NOT IN ('won', 'lost', 'cancelled'))::text AS active,
           COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '14 days')::text AS stale
         FROM captures`,
      );
      const r = res.rows[0];
      return `${r?.total ?? 0} capture records, ${r?.active ?? 0} active. ${r?.stale ?? 0} have not been updated in over 14 days.`;
    }
    case 'action_items': {
      const res = await pool.query<{
        open: string;
        overdue: string;
        due_today: string;
        draft_ready: string;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'open')::text AS open,
           COUNT(*) FILTER (WHERE status = 'open' AND due_date < NOW())::text AS overdue,
           COUNT(*) FILTER (WHERE status = 'open' AND due_date::date = CURRENT_DATE)::text AS due_today,
           COUNT(*) FILTER (WHERE status IN ('open', 'in_progress') AND draft_status = 'ready')::text AS draft_ready
         FROM action_items`,
      );
      const r = res.rows[0];
      return `${r?.open ?? 0} open action items. ${r?.due_today ?? 0} due today, ${r?.overdue ?? 0} overdue. ${r?.draft_ready ?? 0} AI drafts ready for review.`;
    }
    case 'partner_intel': {
      const res = await pool.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM partner_profiles`,
      );
      return `${res.rows[0]?.total ?? 0} partner profiles tracked. Teaming radar monitoring Riverstone and PD Systems posture.`;
    }
    case 'risks': {
      const res = await pool.query<{
        total: string;
        critical: string;
        high: string;
        open: string;
      }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE severity = 'critical')::text AS critical,
           COUNT(*) FILTER (WHERE severity = 'high')::text AS high,
           COUNT(*) FILTER (WHERE status = 'open')::text AS open
         FROM risks`,
      );
      const r = res.rows[0];
      return `${r?.total ?? 0} total risks, ${r?.open ?? 0} open. ${r?.critical ?? 0} critical, ${r?.high ?? 0} high severity.`;
    }
    case 'sentinel': {
      const res = await pool.query<{
        total: string;
        healthy: string;
        stale: string;
      }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE status = 'healthy')::text AS healthy,
           COUNT(*) FILTER (WHERE status IN ('stale', 'error'))::text AS stale
         FROM source_status`,
      );
      const r = res.rows[0];
      return `${r?.total ?? 0} sources monitored. ${r?.healthy ?? 0} healthy, ${r?.stale ?? 0} degraded or stale.`;
    }
    default:
      return 'No summary available.';
  }
}

export async function getDoorSummaries(): Promise<DoorSummariesResult> {
  const cachedRes = await pool.query<{
    door_key: string;
    door_label: string;
    summary: string;
    generated_at: string;
  }>(
    `SELECT door_key, door_label, summary, generated_at::text
     FROM launchpad_door_summaries
     WHERE expires_at > NOW()
     ORDER BY door_key`,
  );

  const cachedMap = new Map<string, DoorSummary>();
  for (const row of cachedRes.rows) {
    cachedMap.set(row.door_key, {
      door_key: row.door_key,
      door_label: row.door_label,
      summary: row.summary,
      generated_at: row.generated_at,
    });
  }

  const summaries: DoorSummary[] = [];
  for (const door of DOORS) {
    const cached = cachedMap.get(door.key);
    if (cached) {
      summaries.push(cached);
      continue;
    }

    const summary = await generateSummary(door.key);
    const now = new Date().toISOString();

    await pool.query(
      `INSERT INTO launchpad_door_summaries (door_key, door_label, summary, generated_at, expires_at)
       VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '1 hour')
       ON CONFLICT (door_key)
       DO UPDATE SET summary = $3, generated_at = NOW(), expires_at = NOW() + INTERVAL '1 hour'`,
      [door.key, door.label, summary],
    );

    summaries.push({
      door_key: door.key,
      door_label: door.label,
      summary,
      generated_at: now,
    });
  }

  return {
    summaries,
    generated_at: new Date().toISOString(),
  };
}
