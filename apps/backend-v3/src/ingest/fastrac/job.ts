/**
 * FasTrac Tier 1 ingestion job — orchestrates all Tier 1 innovation
 * org adapters in sequence (or batched parallel), normalizes, dedupes,
 * and writes to fast_track_signals.
 *
 * Schedule: daily 0500 ET (09:00 UTC) — see cron/index.ts
 * Idempotent: dedup by source_url unique index.
 */

import { logger } from '../../lib/logger.js';
import { TIER1_SOURCES } from './sources.js';
import { fetchSAMSignals } from './sam-adapter.js';
import { fetchHTMLSignals } from './html-adapter.js';
import { upsertSignals } from './writer.js';
import type { FasTracSignal, IngestionResult, SourceConfig } from './types.js';

const BATCH_SIZE = 5;

async function runAdapter(source: SourceConfig): Promise<FasTracSignal[]> {
  if (!source.enabled) {
    logger.info({ source: source.name, reason: source.disabledReason }, 'fastrac_adapter_disabled');
    return [];
  }

  switch (source.pattern) {
    case 'sam_keyword':
      return fetchSAMSignals(source);
    case 'html_scrape':
      return fetchHTMLSignals(source);
    case 'dsip_api':
      // DSIP shares SAM.gov keyword infrastructure (dodsbirsttr.mil posts to SAM)
      return fetchSAMSignals(source);
    case 'govdelivery':
      // GovDelivery bulletin archive polling — falls back to HTML scrape
      return fetchHTMLSignals(source);
    default:
      logger.warn({ source: source.name, pattern: source.pattern }, 'fastrac_unknown_pattern');
      return [];
  }
}

/**
 * Run all Tier 1 adapters. Batches in groups of BATCH_SIZE for
 * parallelism without overwhelming external APIs.
 */
export async function runFasTracTier1Ingest(): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  degraded?: boolean;
  degradedReason?: string;
  stats?: Record<string, unknown>;
}> {
  logger.info({ adapterCount: TIER1_SOURCES.length }, 'fastrac_tier1_ingest_start');

  const results: IngestionResult[] = [];
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  // Process sources in batches
  for (let i = 0; i < TIER1_SOURCES.length; i += BATCH_SIZE) {
    const batch = TIER1_SOURCES.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (source) => {
        const startMs = Date.now();
        try {
          const signals = await runAdapter(source);
          const writeResult = await upsertSignals(signals);

          const result: IngestionResult = {
            source: source.name,
            inserted: writeResult.inserted,
            updated: writeResult.updated,
            errors: writeResult.errors,
          };

          logger.info(
            {
              source: source.name,
              inserted: writeResult.inserted,
              updated: writeResult.updated,
              errors: writeResult.errors,
              signalsFetched: signals.length,
              durationMs: Date.now() - startMs,
            },
            'fastrac_adapter_completed',
          );

          return result;
        } catch (err) {
          logger.error(
            {
              source: source.name,
              error: err instanceof Error ? err.message : String(err),
              durationMs: Date.now() - startMs,
            },
            'fastrac_adapter_failed',
          );
          return {
            source: source.name,
            inserted: 0,
            updated: 0,
            errors: 1,
          } satisfies IngestionResult;
        }
      }),
    );

    for (const settled of batchResults) {
      if (settled.status === 'fulfilled') {
        results.push(settled.value);
        totalInserted += settled.value.inserted;
        totalUpdated += settled.value.updated;
        totalErrors += settled.value.errors;
      }
    }
  }

  const failedSources = results.filter((r) => r.errors > 0).map((r) => r.source);
  const zeroSignalSources = results
    .filter((r) => r.errors === 0 && r.inserted === 0 && r.updated === 0)
    .map((r) => r.source);

  logger.info(
    {
      totalSources: TIER1_SOURCES.length,
      totalInserted,
      totalUpdated,
      totalErrors,
      failedSources,
      zeroSignalSources,
      results: results.map((r) => `${r.source}: +${r.inserted} ~${r.updated} !${r.errors}`),
    },
    'fastrac_tier1_ingest_complete',
  );

  // A batch that finishes with per-adapter failures previously logged as a
  // clean success (errors were only counted as `skipped`), so a broken
  // innovation-org adapter stayed invisible. Surface it as a degraded run so
  // Sentinel records it instead of resolving the source as healthy.
  const degraded = failedSources.length > 0;
  const degradedReason = degraded
    ? `${failedSources.length}/${TIER1_SOURCES.length} adapters failed: ${failedSources.join(', ')}`
    : undefined;

  return {
    inserted: totalInserted,
    updated: totalUpdated,
    skipped: totalErrors,
    degraded,
    degradedReason,
    stats: { failedSources, zeroSignalSources, totalSources: TIER1_SOURCES.length },
  };
}
