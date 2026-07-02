/**
 * Daily News service — F-308
 *
 * Queries launchpad_daily_news for last 24h items, ranked by F-302 relevance score.
 * Respects F-303 doctrine exclusions (filtered out unless showExcluded=true).
 */

import { pool } from '../../lib/db.js';

export interface DailyNewsItem {
  id: number;
  source: string;
  source_id: string | null;
  source_url: string | null;
  title: string;
  agency: string | null;
  dollar_value: number | null;
  why_it_matters: string | null;
  relevance_score: number;
  posted_at: string | null;
  ingested_at: string;
  naics_code: string | null;
  set_aside: string | null;
  doctrine_excluded: boolean;
}

export interface DailyNewsResult {
  items: DailyNewsItem[];
  total: number;
  generated_at: string;
  quiet_morning: boolean;
}

export async function getDailyNews(opts: {
  limit?: number;
  showExcluded?: boolean;
}): Promise<DailyNewsResult> {
  const limit = opts.limit ?? 15;
  const showExcluded = opts.showExcluded ?? false;

  const conditions = [
    `posted_at > NOW() - INTERVAL '24 hours'`,
    `dismissed_at IS NULL`,
  ];
  if (!showExcluded) {
    conditions.push(`doctrine_excluded = FALSE`);
  }

  const whereClause = conditions.join(' AND ');

  const [itemsRes, countRes] = await Promise.all([
    pool.query<{
      id: number;
      source: string;
      source_id: string | null;
      source_url: string | null;
      title: string;
      agency: string | null;
      dollar_value: string | null;
      why_it_matters: string | null;
      relevance_score: number;
      posted_at: string | null;
      ingested_at: string;
      naics_code: string | null;
      set_aside: string | null;
      doctrine_excluded: boolean;
    }>(
      `SELECT id, source, source_id, source_url, title, agency,
              dollar_value::text, why_it_matters, relevance_score,
              posted_at::text, ingested_at::text, naics_code, set_aside,
              doctrine_excluded
       FROM launchpad_daily_news
       WHERE ${whereClause}
       ORDER BY relevance_score DESC, posted_at DESC
       LIMIT $1`,
      [limit],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM launchpad_daily_news WHERE ${whereClause}`,
    ),
  ]);

  const items: DailyNewsItem[] = itemsRes.rows.map((r) => ({
    id: r.id,
    source: r.source,
    source_id: r.source_id,
    source_url: r.source_url,
    title: r.title,
    agency: r.agency,
    dollar_value: r.dollar_value != null ? Number(r.dollar_value) / 100 : null,
    why_it_matters: r.why_it_matters,
    relevance_score: r.relevance_score,
    posted_at: r.posted_at,
    ingested_at: r.ingested_at,
    naics_code: r.naics_code,
    set_aside: r.set_aside,
    doctrine_excluded: r.doctrine_excluded,
  }));

  const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

  return {
    items,
    total,
    generated_at: new Date().toISOString(),
    quiet_morning: total === 0,
  };
}
