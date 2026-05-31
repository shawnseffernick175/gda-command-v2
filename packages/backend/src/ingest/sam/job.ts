/**
 * SAM.gov ingest job — pulls the last 24 hours of opportunities,
 * maps each record, and upserts with source citations.
 */

import { log } from "../../lib/logger";
import { fetchOpportunities } from "./client";
import { mapSAMOpportunity } from "./mapper";
import { upsertOpportunityWithSources } from "../framework/source_writer";
import type { IngestResult } from "../framework/registry";

const LOOKBACK_HOURS = 24;

export async function runSAMIngest(): Promise<IngestResult> {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);

  log.info("sam_ingest_job_start", {
    source: "sam.gov",
    fromDate: fromDate.toISOString(),
    toDate: toDate.toISOString(),
  });

  const rawOpps = await fetchOpportunities(fromDate, toDate);

  log.info("sam_ingest_fetched", {
    source: "sam.gov",
    totalFetched: rawOpps.length,
  });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of rawOpps) {
    try {
      if (!raw.noticeId) {
        skipped++;
        continue;
      }

      const { opportunity, citations } = mapSAMOpportunity(raw);
      const outcome = await upsertOpportunityWithSources(opportunity, citations, "sam_gov");

      if (outcome === "inserted") inserted++;
      else if (outcome === "updated") updated++;
      else skipped++;
    } catch (err) {
      skipped++;
      log.error("sam_ingest_row_error", {
        source: "sam.gov",
        noticeId: raw.noticeId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { inserted, updated, skipped };
}
