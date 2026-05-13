// ---------------------------------------------------------------------------
// Feed Sync Orchestrator
// Coordinates periodic fetching from SAM.gov and USAspending APIs
// ---------------------------------------------------------------------------

import { getPool } from "./db";
import { log } from "./logger";
import {
  isSAMConfigured,
  fetchAllOpportunities,
  toSAMDate,
  mapToDBRecord as mapSAMRecord,
} from "./sam-api";
import {
  fetchAllAwards,
  mapToDBRecord as mapFPDSRecord,
} from "./fpds-api";

export interface SyncResult {
  feed: string;
  status: "success" | "error";
  fetched: number;
  upserted: number;
  errors: number;
  durationMs: number;
  error?: string;
}

/** Sync SAM.gov opportunities for the given date range (default: last 30 days). */
export async function syncSAMOpportunities(
  daysBack = 30,
  naicsFilter?: string[],
): Promise<SyncResult> {
  const start = Date.now();
  const feed = "sam-opportunities";

  if (!isSAMConfigured()) {
    return { feed, status: "error", fetched: 0, upserted: 0, errors: 0,
      durationMs: Date.now() - start, error: "SAM_API_KEY not configured" };
  }

  const pool = getPool();
  if (!pool) {
    return { feed, status: "error", fetched: 0, upserted: 0, errors: 0,
      durationMs: Date.now() - start, error: "Database not available" };
  }

  const runId = `sam-sync-${Date.now()}`;
  try {
    // Record sync run start
    await pool.query(
      `INSERT INTO sam_scan_runs (id, started_at, status, naics_codes_scanned)
       VALUES ($1, NOW(), 'running', $2)`,
      [runId, naicsFilter ?? []],
    );

    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - daysBack);

    let allRaw;
    if (naicsFilter?.length) {
      // Fetch per NAICS code (SAM API only supports one at a time)
      allRaw = [];
      for (const ncode of naicsFilter) {
        const batch = await fetchAllOpportunities({
          postedFrom: toSAMDate(from),
          postedTo: toSAMDate(to),
          ncode,
        }, 5);
        allRaw.push(...batch);
      }
    } else {
      allRaw = await fetchAllOpportunities({
        postedFrom: toSAMDate(from),
        postedTo: toSAMDate(to),
      }, 5);
    }

    log.info("sam_sync_fetched", { count: allRaw.length });

    let upserted = 0;
    let errors = 0;

    for (const raw of allRaw) {
      try {
        const record = mapSAMRecord(raw);
        await pool.query(`
          INSERT INTO sam_opportunities (
            id, notice_id, title, agency, sub_agency, type, set_aside,
            naics, naics_description, psc, value_estimate,
            response_deadline, posted_date, place_of_performance,
            relevance_score, relevance_reasons, ai_summary,
            scan_status, matched_naics, matched_keywords, sam_url, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title, agency = EXCLUDED.agency,
            sub_agency = EXCLUDED.sub_agency, type = EXCLUDED.type,
            set_aside = EXCLUDED.set_aside, naics = EXCLUDED.naics,
            psc = EXCLUDED.psc, value_estimate = EXCLUDED.value_estimate,
            response_deadline = EXCLUDED.response_deadline,
            place_of_performance = EXCLUDED.place_of_performance,
            sam_url = EXCLUDED.sam_url
        `, [
          record.id, record.notice_id, record.title,
          record.agency, record.sub_agency, record.type, record.set_aside,
          record.naics, record.naics_description, record.psc, record.value_estimate,
          record.response_deadline, record.posted_date, record.place_of_performance,
          record.relevance_score, record.relevance_reasons, record.ai_summary,
          record.scan_status, record.matched_naics, record.matched_keywords,
          record.sam_url,
        ]);
        upserted++;
      } catch (e) {
        errors++;
        log.warn("sam_sync_upsert_error", { error: (e as Error).message });
      }
    }

    // Update scan run
    await pool.query(
      `UPDATE sam_scan_runs SET status = 'completed', completed_at = NOW(),
       opportunities_found = $2, new_matches = $3 WHERE id = $1`,
      [runId, allRaw.length, upserted],
    );

    const result: SyncResult = {
      feed, status: "success", fetched: allRaw.length,
      upserted, errors, durationMs: Date.now() - start,
    };
    log.info("sam_sync_complete", { ...result });
    return result;
  } catch (e) {
    // Mark scan run as failed so it doesn't stay permanently 'running'
    if (runId) {
      try {
        await pool.query(
          `UPDATE sam_scan_runs SET status = 'failed', completed_at = NOW() WHERE id = $1`,
          [runId],
        );
      } catch { /* best effort */ }
    }
    const result: SyncResult = {
      feed, status: "error", fetched: 0, upserted: 0, errors: 1,
      durationMs: Date.now() - start, error: (e as Error).message,
    };
    log.error("sam_sync_failed", { ...result });
    return result;
  }
}

/** Sync FPDS awards from USAspending API. */
export async function syncFPDSAwards(
  daysBack = 90,
  keywords?: string[],
): Promise<SyncResult> {
  const start = Date.now();
  const feed = "fpds-awards";

  const pool = getPool();
  if (!pool) {
    return { feed, status: "error", fetched: 0, upserted: 0, errors: 0,
      durationMs: Date.now() - start, error: "Database not available" };
  }

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const allRaw = await fetchAllAwards({
      keywords,
      dateRange: {
        start_date: startDate.toISOString().slice(0, 10),
        end_date: endDate.toISOString().slice(0, 10),
      },
    }, 5, 100);

    log.info("fpds_sync_fetched", { count: allRaw.length });

    let upserted = 0;
    let errors = 0;

    for (const raw of allRaw) {
      try {
        const record = mapFPDSRecord(raw);
        await pool.query(`
          INSERT INTO fpds_awards (
            id, piid, title, agency, vendor, vendor_duns,
            award_amount, ceiling_amount, award_date,
            period_of_performance_start, period_of_performance_end,
            award_type, competition_type, naics, psc, place_of_performance,
            is_competitor, competitor_name, is_recompete_candidate, recompete_date,
            relevance_score, fpds_url, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW())
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title, vendor = EXCLUDED.vendor,
            award_amount = EXCLUDED.award_amount, ceiling_amount = EXCLUDED.ceiling_amount,
            place_of_performance = EXCLUDED.place_of_performance,
            fpds_url = EXCLUDED.fpds_url
        `, [
          record.id, record.piid, record.title, record.agency,
          record.vendor, record.vendor_duns,
          record.award_amount, record.ceiling_amount, record.award_date,
          record.period_of_performance_start, record.period_of_performance_end,
          record.award_type, record.competition_type,
          record.naics, record.psc, record.place_of_performance,
          record.is_competitor, record.competitor_name,
          record.is_recompete_candidate, record.recompete_date,
          record.relevance_score, record.fpds_url,
        ]);
        upserted++;
      } catch (e) {
        errors++;
        log.warn("fpds_sync_upsert_error", { error: (e as Error).message });
      }
    }

    const result: SyncResult = {
      feed, status: "success", fetched: allRaw.length,
      upserted, errors, durationMs: Date.now() - start,
    };
    log.info("fpds_sync_complete", { ...result });
    return result;
  } catch (e) {
    const result: SyncResult = {
      feed, status: "error", fetched: 0, upserted: 0, errors: 1,
      durationMs: Date.now() - start, error: (e as Error).message,
    };
    log.error("fpds_sync_failed", { ...result });
    return result;
  }
}

/** Run all feeds (SAM.gov, FPDS, GovTribe, GovWin, DIBBS). */
export async function syncAllFeeds(
  options?: {
    samDaysBack?: number;
    fpdsDaysBack?: number;
    naicsFilter?: string[];
    fpdsKeywords?: string[];
  },
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  results.push(await syncSAMOpportunities(
    options?.samDaysBack ?? 30,
    options?.naicsFilter,
  ));

  results.push(await syncFPDSAwards(
    options?.fpdsDaysBack ?? 90,
    options?.fpdsKeywords,
  ));

  // Sync additional gov sources (GovTribe, GovWin, DIBBS)
  try {
    const { syncGovSources } = await import("./gov-sources");
    const govResults = await syncGovSources();
    for (const r of govResults) {
      results.push({
        feed: r.source,
        status: r.status === "skipped" ? "success" : r.status,
        fetched: r.fetched,
        upserted: r.upserted,
        errors: r.error ? 1 : 0,
        durationMs: r.durationMs,
        error: r.error,
      });
    }
  } catch (e) {
    log.warn("gov_sources_sync_error", { error: (e as Error).message });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Scheduled sync (setInterval-based, started from server.ts)
// ---------------------------------------------------------------------------

let syncTimer: ReturnType<typeof setInterval> | null = null;

export function startScheduledSync(intervalHours = 6): void {
  if (syncTimer) return; // already running
  const intervalMs = intervalHours * 60 * 60 * 1000;

  log.info("feed_sync_scheduled", { intervalHours });

  // Run immediately on startup (after a short delay for DB to be ready)
  setTimeout(() => {
    syncAllFeeds().catch((e) => log.error("scheduled_sync_error", { error: (e as Error).message }));
  }, 10_000);

  syncTimer = setInterval(() => {
    syncAllFeeds().catch((e) => log.error("scheduled_sync_error", { error: (e as Error).message }));
  }, intervalMs);
}

export function stopScheduledSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
