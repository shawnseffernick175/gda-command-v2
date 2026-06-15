/**
 * Task Order Ingest Service — orchestrates polling all active vehicle sources,
 * ingests new TOs, and triggers eligibility computation.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { pollGsaEbuy, parseGsaEbuy } from './sources/gsaEbuySource.js';
import { pollSamGovTO, parseSamGovTO } from './sources/samGovTOSource.js';
import { computeEligibility, computeWheelhouseScore, computeHeatTier } from './eligibilityService.js';
import type { RawTOPosting, TaskOrderAnnouncement } from './sources/gsaEbuySource.js';

interface VehicleSource {
  id: number;
  vehicle_id: number;
  source_type: string;
  source_url: string | null;
  source_config: Record<string, unknown> | null;
  poll_interval_minutes: number;
  last_polled_at: string | null;
  vehicle_short_name: string;
  vehicle_naics_codes: string[] | null;
}

/**
 * Poll a single source and ingest results.
 */
export async function pollSource(sourceId: number): Promise<{ ingested: number; errors: number }> {
  const srcResult = await pool.query<VehicleSource>(`
    SELECT vts.*, cv.short_name AS vehicle_short_name, cv.naics_codes AS vehicle_naics_codes
    FROM vehicle_to_sources vts
    JOIN contract_vehicles cv ON cv.id = vts.vehicle_id
    WHERE vts.id = $1 AND vts.is_active = true
  `, [sourceId]);

  if (srcResult.rows.length === 0) {
    logger.warn({ sourceId }, '[ingest] source not found or inactive');
    return { ingested: 0, errors: 0 };
  }

  const source = srcResult.rows[0];
  let rawPostings: RawTOPosting[] = [];

  try {
    switch (source.source_type) {
      case 'gsa_ebuy':
        rawPostings = await pollGsaEbuy(source.vehicle_id, source.source_config ?? {});
        break;
      case 'sam_gov':
        rawPostings = await pollSamGovTO(source.vehicle_id, source.source_config ?? {});
        break;
      case 'nitaac_egos':
      case 'seaport_nxg_portal':
      case 'rs3_sharepoint':
      case 'efast_ksn':
      case 'digital_market_army':
      case 'vendor_email':
      case 'manual':
        // These sources are CAC-gated or manual — skip automated polling
        logger.info({ sourceId, type: source.source_type }, '[ingest] manual source — skipped');
        await updateSourceStatus(sourceId, 'manual');
        return { ingested: 0, errors: 0 };
      default:
        logger.warn({ sourceId, type: source.source_type }, '[ingest] unknown source type');
        return { ingested: 0, errors: 0 };
    }

    // Parse and upsert TOs
    let ingested = 0;
    let errors = 0;

    for (const raw of rawPostings) {
      try {
        const parsed = source.source_type === 'gsa_ebuy'
          ? parseGsaEbuy(raw, source.vehicle_short_name)
          : parseSamGovTO(raw, source.vehicle_short_name);

        await upsertTaskOrder(parsed, source);
        ingested++;
      } catch (err) {
        errors++;
        logger.error(
          { error: err instanceof Error ? err.message : String(err), noticeId: raw.noticeId },
          '[ingest] failed to process TO',
        );
      }
    }

    await updateSourceStatus(sourceId, 'success');
    logger.info({ sourceId, ingested, errors, vehicle: source.vehicle_short_name }, '[ingest] poll complete');
    return { ingested, errors };
  } catch (err) {
    await updateSourceStatus(sourceId, 'failed');
    logger.error(
      { sourceId, error: err instanceof Error ? err.message : String(err) },
      '[ingest] source poll failed',
    );
    return { ingested: 0, errors: 1 };
  }
}

/**
 * Poll all active sources that are due for polling.
 */
export async function pollAllDueSources(): Promise<{ totalIngested: number; totalErrors: number }> {
  const dueResult = await pool.query<{ id: number }>(`
    SELECT id FROM vehicle_to_sources
    WHERE is_active = true
      AND poll_interval_minutes > 0
      AND (last_polled_at IS NULL OR last_polled_at < NOW() - (poll_interval_minutes || ' minutes')::interval)
    ORDER BY last_polled_at ASC NULLS FIRST
  `);

  let totalIngested = 0;
  let totalErrors = 0;

  for (const row of dueResult.rows) {
    const result = await pollSource(row.id);
    totalIngested += result.ingested;
    totalErrors += result.errors;
  }

  return { totalIngested, totalErrors };
}

async function upsertTaskOrder(to: TaskOrderAnnouncement, source: VehicleSource): Promise<void> {
  // Compute eligibility
  const eligibility = await computeEligibility(
    source.vehicle_id, to.set_aside, to.pool_or_lane, to.naics_code,
  );

  const daysLeft = to.response_due
    ? Math.ceil((new Date(to.response_due).getTime() - Date.now()) / 86_400_000)
    : null;

  const wheelhouseScore = computeWheelhouseScore(
    to.naics_code, to.agency, to.est_value_usd,
    to.set_aside, source.vehicle_naics_codes,
  );

  const heatTier = computeHeatTier(eligibility.eligible, daysLeft, wheelhouseScore);

  await pool.query(`
    INSERT INTO task_order_announcements (
      vehicle_id, source_id, external_id, title, agency, sub_agency,
      pool_or_lane, set_aside, naics_code, est_value_usd,
      posted_date, response_due, status, description, source_url, attachments,
      envision_eligible, eligibility_reason, wheelhouse_score, heat_tier,
      ingested_via, last_seen_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
    ON CONFLICT (vehicle_id, external_id, source_id) DO UPDATE SET
      title = EXCLUDED.title,
      agency = EXCLUDED.agency,
      sub_agency = EXCLUDED.sub_agency,
      set_aside = EXCLUDED.set_aside,
      est_value_usd = COALESCE(EXCLUDED.est_value_usd, task_order_announcements.est_value_usd),
      response_due = COALESCE(EXCLUDED.response_due, task_order_announcements.response_due),
      status = EXCLUDED.status,
      description = EXCLUDED.description,
      attachments = COALESCE(EXCLUDED.attachments, task_order_announcements.attachments),
      envision_eligible = EXCLUDED.envision_eligible,
      eligibility_reason = EXCLUDED.eligibility_reason,
      wheelhouse_score = EXCLUDED.wheelhouse_score,
      heat_tier = EXCLUDED.heat_tier,
      last_seen_at = NOW()
  `, [
    source.vehicle_id, source.id, to.external_id, to.title, to.agency, to.sub_agency,
    to.pool_or_lane, to.set_aside, to.naics_code, to.est_value_usd,
    to.posted_date, to.response_due, to.status, to.description, to.source_url,
    to.attachments ? JSON.stringify(to.attachments) : null,
    eligibility.eligible, eligibility.reason, wheelhouseScore, heatTier,
    source.source_type,
  ]);
}

async function updateSourceStatus(sourceId: number, status: string): Promise<void> {
  await pool.query(
    `UPDATE vehicle_to_sources SET last_polled_at = NOW(), last_status = $1, updated_at = NOW() WHERE id = $2`,
    [status, sourceId],
  );
}
