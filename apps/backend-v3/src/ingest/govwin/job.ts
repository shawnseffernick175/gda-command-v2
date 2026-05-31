/**
 * GovWin IQ ingest job — discovers recently-modified opportunities
 * via the GovWin web UI, scrapes detail pages, and upserts into the
 * opportunities table with kind='govwin'. Caches raw payloads to
 * govwin_cache for debugging/reprocessing.
 *
 * Deduplication: matches existing SAM rows by solicitation_number
 * first, then (agency, title, due_date). GovWin rows supplement
 * SAM rows (incumbent, competitors) but do NOT replace them.
 */

import { pool } from '../../lib/db.js';
import type { PoolClient } from 'pg';
import { logger } from '../../lib/logger.js';
import {
  discoverRecentOpportunityIds,
  fetchOpportunityBatch,
  type GovWinOpportunity,
} from '../../services/govwin/client.js';
import type { IngestResult } from '../framework/registry.js';

const CACHE_RETENTION_DAYS = 30;

async function upsertGovWinCache(opp: GovWinOpportunity): Promise<void> {
  const payload = {
    title: opp.title,
    agency: opp.agency,
    solicitationNumber: opp.solicitationNumber,
    status: opp.status,
    naics: opp.naics,
    setAside: opp.setAside,
    incumbent: opp.incumbent,
    competitors: opp.competitors,
    valueMin: opp.valueMin,
    valueMax: opp.valueMax,
    responseDueAt: opp.responseDueAt,
    postedAt: opp.postedAt,
    description: opp.description?.slice(0, 5000) ?? null,
    sourceUri: opp.sourceUri,
  };

  await pool.query(
    `INSERT INTO govwin_cache (govwin_id, endpoint, raw_payload)
     VALUES ($1, $2, $3)
     ON CONFLICT (govwin_id, endpoint)
     DO UPDATE SET raw_payload = $3, fetched_at = NOW()`,
    [opp.govwinId, 'opportunities', JSON.stringify(payload)],
  );
}

async function findExistingSAMOpp(db: PoolClient, opp: GovWinOpportunity): Promise<string | null> {
  if (opp.solicitationNumber) {
    const { rows } = await db.query(
      `SELECT id FROM opportunities
       WHERE solicitation_number = $1 AND data_source != 'govwin'
       LIMIT 1`,
      [opp.solicitationNumber],
    );
    if (rows[0]) return rows[0].id;
  }

  if (opp.agency && opp.title && opp.responseDueAt) {
    const { rows } = await db.query(
      `SELECT id FROM opportunities
       WHERE agency = $1
         AND LOWER(title) = LOWER($2)
         AND response_due_at::date = $3::date
         AND data_source != 'govwin'
       LIMIT 1`,
      [opp.agency, opp.title, opp.responseDueAt],
    );
    if (rows[0]) return rows[0].id;
  }

  return null;
}

async function upsertOpportunity(
  opp: GovWinOpportunity,
): Promise<'inserted' | 'updated' | 'skipped'> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sourceUrl = opp.sourceUri;
    const { rows: sourceRows } = await client.query(
      `INSERT INTO sources (kind, url, title, confidence, meta)
       VALUES ('govwin', $1, $2, 'high', '{}')
       RETURNING id`,
      [sourceUrl, `GovWin Opp ${opp.govwinId}`],
    );
    const sourceId = sourceRows[0].id;

    const existingSamId = await findExistingSAMOpp(client, opp);

    if (existingSamId) {
      await client.query(
        `UPDATE opportunities
         SET tags = array_append(
               array_remove(tags, 'govwin_enriched'),
               'govwin_enriched'
             ),
             description = COALESCE(NULLIF($1, ''), description),
             incumbent = COALESCE($3, incumbent),
             incumbent_confidence = CASE WHEN $3 IS NOT NULL THEN 'high' ELSE incumbent_confidence END,
             incumbent_source = CASE WHEN $3 IS NOT NULL THEN 'govwin' ELSE incumbent_source END,
             updated_at = NOW()
         WHERE id = $2`,
        [
          opp.description,
          existingSamId,
          opp.incumbent,
        ],
      );

      await client.query(
        `INSERT INTO opportunity_title_sources (opportunity_id, source_id)
         VALUES ($1, $2)
         ON CONFLICT (opportunity_id, source_id) DO NOTHING`,
        [existingSamId, sourceId],
      );

      await client.query('COMMIT');
      return 'updated';
    }

    const samNoticeId = `govwin-${opp.govwinId}`;

    const { rows: upsertRows } = await client.query(
      `INSERT INTO opportunities (
         title, agency, sub_agency, solicitation_number,
         sam_notice_id, status, value_min, value_max, naics,
         set_aside, response_due_at, posted_at,
         description, data_source, tags, source_id,
         incumbent, incumbent_confidence, incumbent_source
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (sam_notice_id) DO UPDATE SET
         title               = EXCLUDED.title,
         agency              = EXCLUDED.agency,
         sub_agency          = EXCLUDED.sub_agency,
         solicitation_number = EXCLUDED.solicitation_number,
         value_min           = EXCLUDED.value_min,
         value_max           = EXCLUDED.value_max,
         naics               = EXCLUDED.naics,
         set_aside           = EXCLUDED.set_aside,
         response_due_at     = EXCLUDED.response_due_at,
         posted_at           = EXCLUDED.posted_at,
         description         = EXCLUDED.description,
         data_source         = EXCLUDED.data_source,
         source_id           = EXCLUDED.source_id,
         incumbent           = COALESCE(EXCLUDED.incumbent, opportunities.incumbent),
         incumbent_confidence = CASE WHEN EXCLUDED.incumbent IS NOT NULL THEN 'high' ELSE opportunities.incumbent_confidence END,
         incumbent_source    = CASE WHEN EXCLUDED.incumbent IS NOT NULL THEN 'govwin' ELSE opportunities.incumbent_source END,
         updated_at          = NOW()
       RETURNING id, (xmax = 0) AS was_inserted`,
      [
        opp.title,
        opp.agency,
        opp.subAgency,
        opp.solicitationNumber,
        samNoticeId,
        'discovery',
        opp.valueMin,
        opp.valueMax,
        opp.naics,
        opp.setAside,
        opp.responseDueAt,
        opp.postedAt,
        opp.description,
        'govwin',
        '{govwin}',
        sourceId,
        opp.incumbent,
        opp.incumbent ? 'high' : null,
        opp.incumbent ? 'govwin' : null,
      ],
    );

    const wasInserted: boolean = upsertRows[0].was_inserted;
    const oppId = upsertRows[0].id;

    await client.query(
      `INSERT INTO opportunity_title_sources (opportunity_id, source_id)
       VALUES ($1, $2)
       ON CONFLICT (opportunity_id, source_id) DO NOTHING`,
      [oppId, sourceId],
    );

    await client.query('COMMIT');
    return wasInserted ? 'inserted' : 'updated';
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function cleanOldCache(): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM govwin_cache
     WHERE fetched_at < NOW() - INTERVAL '${CACHE_RETENTION_DAYS} days'`,
  );
  return rowCount ?? 0;
}

export async function runGovWinIngest(): Promise<IngestResult> {
  logger.info('govwin_ingest_start');

  const ids = await discoverRecentOpportunityIds();
  logger.info({ count: ids.length }, 'govwin_ingest_discovered_ids');

  if (ids.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  const opps = await fetchOpportunityBatch(ids);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const opp of opps) {
    try {
      await upsertGovWinCache(opp);
      const outcome = await upsertOpportunity(opp);
      if (outcome === 'inserted') inserted++;
      else if (outcome === 'updated') updated++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          govwinId: opp.govwinId,
          error: err instanceof Error ? err.message : String(err),
        },
        'govwin_ingest_opp_error',
      );
    }
  }

  const cleaned = await cleanOldCache();
  if (cleaned > 0) {
    logger.info({ cleaned }, 'govwin_cache_cleaned');
  }

  logger.info({ inserted, updated, skipped }, 'govwin_ingest_complete');
  return { inserted, updated, skipped };
}
