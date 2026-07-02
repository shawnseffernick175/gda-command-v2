/**
 * Day-1 Banners service — F-308
 *
 * Returns major events from the last 24h that meet the "big enough to interrupt" threshold.
 * Limited to 3 items max (spec). Rolled over at midnight EST via cron.
 */

import { pool } from '../../lib/db.js';

export interface Day1Banner {
  id: number;
  source: string;
  source_url: string | null;
  title: string;
  agency: string | null;
  dollar_value: number | null;
  why_it_matters: string | null;
  posted_at: string | null;
}

export interface Day1BannersResult {
  banners: Day1Banner[];
  generated_at: string;
}

export async function getDay1Banners(): Promise<Day1BannersResult> {
  const res = await pool.query<{
    id: number;
    source: string;
    source_url: string | null;
    title: string;
    agency: string | null;
    dollar_value: string | null;
    why_it_matters: string | null;
    posted_at: string | null;
  }>(
    `SELECT id, source, source_url, title, agency,
            dollar_value::text, why_it_matters, posted_at::text
     FROM launchpad_daily_news
     WHERE is_day1_banner = TRUE
       AND banner_dismissed_at IS NULL
       AND posted_at > NOW() - INTERVAL '24 hours'
     ORDER BY relevance_score DESC, posted_at DESC
     LIMIT 3`,
  );

  const banners: Day1Banner[] = res.rows.map((r) => ({
    id: r.id,
    source: r.source,
    source_url: r.source_url,
    title: r.title,
    agency: r.agency,
    dollar_value: r.dollar_value != null ? Number(r.dollar_value) / 100 : null,
    why_it_matters: r.why_it_matters,
    posted_at: r.posted_at,
  }));

  return {
    banners,
    generated_at: new Date().toISOString(),
  };
}

export async function dismissBanner(bannerId: number): Promise<void> {
  await pool.query(
    `UPDATE launchpad_daily_news SET banner_dismissed_at = NOW() WHERE id = $1`,
    [bannerId],
  );
}
