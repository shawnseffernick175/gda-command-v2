/**
 * Pre-warm worker — F-308
 *
 * Materializes Daily News from ingested sources (SAM, USAspending,
 * Federal Register, GovWin, news) into launchpad_daily_news.
 * Runs hourly via cron. Also refreshes door summaries.
 *
 * Source: own ingest tables — NO OrangeSlices ingestion (F-308 hard rule 1).
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { getDoorSummaries } from './door-summaries.js';

interface PreWarmResult {
  sam_inserted: number;
  usaspending_inserted: number;
  federal_register_inserted: number;
  govwin_inserted: number;
  news_inserted: number;
  total_inserted: number;
  door_summaries_refreshed: number;
}

export async function runLaunchpadPreWarm(): Promise<PreWarmResult> {
  const result: PreWarmResult = {
    sam_inserted: 0,
    usaspending_inserted: 0,
    federal_register_inserted: 0,
    govwin_inserted: 0,
    news_inserted: 0,
    total_inserted: 0,
    door_summaries_refreshed: 0,
  };

  // SAM notices from last 24h not already in launchpad_daily_news
  try {
    const samRes = await pool.query<{ cnt: string }>(
      `INSERT INTO launchpad_daily_news (source, source_id, source_url, title, agency, dollar_value, naics_code, set_aside, posted_at, relevance_score, is_day1_banner)
       SELECT
         'sam',
         o.internal_id::text,
         CASE WHEN l.source_native_id IS NOT NULL
              THEN 'https://sam.gov/opp/' || l.source_native_id || '/view'
              ELSE NULL END,
         o.title,
         o.agency,
         o.estimated_value_cents,
         o.naics,
         o.set_aside,
         o.created_at,
         COALESCE(o.pwin, 0) * 100,
         CASE WHEN o.estimated_value_cents > 1000000000 THEN TRUE ELSE FALSE END
       FROM unified_opportunities o
       LEFT JOIN unified_opportunity_links l ON l.internal_id = o.internal_id AND l.source = 'sam'
       WHERE o.primary_source = 'sam'
         AND o.created_at > NOW() - INTERVAL '24 hours'
         AND NOT EXISTS (
           SELECT 1 FROM launchpad_daily_news dn
           WHERE dn.source = 'sam' AND dn.source_id = o.internal_id::text
             AND dn.posted_at > NOW() - INTERVAL '24 hours'
         )
       RETURNING 1 AS cnt`,
    );
    result.sam_inserted = samRes.rowCount ?? 0;
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, '[pre-warm] SAM insert failed (table may not exist)');
  }

  // USAspending awards from last 24h
  try {
    const usaRes = await pool.query<{ cnt: string }>(
      `INSERT INTO launchpad_daily_news (source, source_id, source_url, title, agency, dollar_value, posted_at, relevance_score, is_day1_banner)
       SELECT
         'usaspending',
         o.internal_id::text,
         CASE WHEN l.source_native_id IS NOT NULL
              THEN 'https://www.usaspending.gov/award/' || l.source_native_id
              ELSE NULL END,
         o.title,
         o.agency,
         o.estimated_value_cents,
         o.created_at,
         COALESCE(o.pwin, 0) * 50,
         CASE WHEN o.estimated_value_cents > 5000000000 THEN TRUE ELSE FALSE END
       FROM unified_opportunities o
       LEFT JOIN unified_opportunity_links l ON l.internal_id = o.internal_id AND l.source = 'usaspending'
       WHERE o.primary_source = 'usaspending'
         AND o.created_at > NOW() - INTERVAL '24 hours'
         AND NOT EXISTS (
           SELECT 1 FROM launchpad_daily_news dn
           WHERE dn.source = 'usaspending' AND dn.source_id = o.internal_id::text
             AND dn.posted_at > NOW() - INTERVAL '24 hours'
         )
       RETURNING 1 AS cnt`,
    );
    result.usaspending_inserted = usaRes.rowCount ?? 0;
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, '[pre-warm] USAspending insert failed');
  }

  // Federal Register notices from last 24h
  try {
    const frRes = await pool.query<{ cnt: string }>(
      `INSERT INTO launchpad_daily_news (source, source_id, source_url, title, agency, posted_at, relevance_score, is_day1_banner)
       SELECT
         'federal_register',
         rn.document_number,
         rn.html_url,
         rn.title,
         array_to_string(rn.agency_names, ', '),
         rn.publication_date,
         10,
         CASE WHEN rn.document_type = 'Rule' THEN TRUE ELSE FALSE END
       FROM regulatory_notices rn
       WHERE rn.publication_date > CURRENT_DATE - INTERVAL '24 hours'
         AND NOT EXISTS (
           SELECT 1 FROM launchpad_daily_news dn
           WHERE dn.source = 'federal_register' AND dn.source_id = rn.document_number
             AND dn.posted_at > NOW() - INTERVAL '24 hours'
         )
       RETURNING 1 AS cnt`,
    );
    result.federal_register_inserted = frRes.rowCount ?? 0;
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, '[pre-warm] Federal Register insert failed');
  }

  // GovWin opportunities from last 24h
  try {
    const gwRes = await pool.query<{ cnt: string }>(
      `INSERT INTO launchpad_daily_news (source, source_id, source_url, title, agency, dollar_value, posted_at, relevance_score)
       SELECT
         'govwin',
         o.internal_id::text,
         CASE WHEN l.source_native_id IS NOT NULL
              THEN 'https://iq.govwin.com/neo/opportunity/' || l.source_native_id
              ELSE NULL END,
         o.title,
         o.agency,
         o.estimated_value_cents,
         o.created_at,
         COALESCE(o.pwin, 0) * 80
       FROM unified_opportunities o
       LEFT JOIN unified_opportunity_links l ON l.internal_id = o.internal_id AND l.source = 'govwin'
       WHERE o.primary_source = 'govwin'
         AND o.created_at > NOW() - INTERVAL '24 hours'
         AND NOT EXISTS (
           SELECT 1 FROM launchpad_daily_news dn
           WHERE dn.source = 'govwin' AND dn.source_id = o.internal_id::text
             AND dn.posted_at > NOW() - INTERVAL '24 hours'
         )
       RETURNING 1 AS cnt`,
    );
    result.govwin_inserted = gwRes.rowCount ?? 0;
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, '[pre-warm] GovWin insert failed');
  }

  // GovCon news from news cache
  try {
    const newsRes = await pool.query<{ cnt: string }>(
      `INSERT INTO launchpad_daily_news (source, source_id, source_url, title, why_it_matters, posted_at, relevance_score)
       SELECT
         'news',
         n.id::text,
         n.url,
         n.title,
         n.blurb,
         n.published_at,
         CASE WHEN n.is_wheelhouse THEN 30 ELSE 10 END
       FROM news_items n
       WHERE n.published_at > NOW() - INTERVAL '24 hours'
         AND NOT EXISTS (
           SELECT 1 FROM launchpad_daily_news dn
           WHERE dn.source = 'news' AND dn.source_id = n.id::text
             AND dn.posted_at > NOW() - INTERVAL '24 hours'
         )
       RETURNING 1 AS cnt`,
    );
    result.news_inserted = newsRes.rowCount ?? 0;
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, '[pre-warm] News insert failed');
  }

  result.total_inserted =
    result.sam_inserted +
    result.usaspending_inserted +
    result.federal_register_inserted +
    result.govwin_inserted +
    result.news_inserted;

  // Refresh door summaries cache
  try {
    const doorResult = await getDoorSummaries();
    result.door_summaries_refreshed = doorResult.summaries.length;
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, '[pre-warm] Door summaries refresh failed');
  }

  return result;
}
