/**
 * USAspending one-shot backfill — pulls N days of DoD contract awards
 * in 7-day chunks, upserts each page immediately via the existing
 * F-241c path, and logs a single ingest_runs row with
 * source_key = 'usaspending.gov.backfill'.
 *
 * Errors in one chunk do NOT abort the whole backfill — they are logged
 * and the run is marked 'degraded' if any chunk failed.
 */

import { logger } from '../../lib/logger.js';
import {
  fetchGroup,
  formatDate,
  CONTRACT_TYPE_CODES,
  IDV_TYPE_CODES,
} from './client.js';
import type { USASpendingAwardRaw } from './client.js';
import { mapUSASpendingAward } from './mapper.js';
import { upsertAwardWithSources } from './job.js';
import { startRun, finishRun } from '../framework/run_logger.js';

const CHUNK_DAYS = 7;
const SOURCE_KEY = 'usaspending.gov.backfill';

export interface BackfillChunkResult {
  chunk_start: string;
  chunk_end: string;
  contracts_rows: number;
  idvs_rows: number;
  inserted: number;
  skipped: number;
  error?: string;
}

export interface BackfillResult {
  run_id: string;
  days: number;
  total_inserted: number;
  total_skipped: number;
  duration_ms: number;
  chunks: BackfillChunkResult[];
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}

async function upsertPage(
  records: USASpendingAwardRaw[],
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const raw of records) {
    try {
      const mapped = mapUSASpendingAward(raw);
      if (!mapped) {
        skipped++;
        continue;
      }
      const outcome = await upsertAwardWithSources(mapped.award, mapped.citations);
      if (outcome === 'inserted') inserted++;
      else skipped++;
    } catch (err) {
      skipped++;
      logger.error(
        {
          source: SOURCE_KEY,
          awardId: raw['Award ID'],
          error: err instanceof Error ? err.message : String(err),
        },
        'usaspending_backfill_row_error',
      );
    }
  }
  return { inserted, skipped };
}

export async function runBackfill({ days }: { days: number }): Promise<BackfillResult> {
  const start = Date.now();
  const toDate = new Date();
  const fromDate = addDays(toDate, -days);

  const runId = await startRun(SOURCE_KEY);
  const chunks: BackfillChunkResult[] = [];
  let totalInserted = 0;
  let totalSkipped = 0;
  let anyChunkFailed = false;

  let chunkStart = new Date(fromDate);
  while (chunkStart < toDate) {
    const chunkEnd = minDate(addDays(chunkStart, CHUNK_DAYS), toDate);
    const startStr = formatDate(chunkStart);
    const endStr = formatDate(chunkEnd);

    const chunk: BackfillChunkResult = {
      chunk_start: startStr,
      chunk_end: endStr,
      contracts_rows: 0,
      idvs_rows: 0,
      inserted: 0,
      skipped: 0,
    };

    try {
      const contractRecords = await fetchGroup('contracts', CONTRACT_TYPE_CODES, startStr, endStr);
      chunk.contracts_rows = contractRecords.length;
      const cResult = await upsertPage(contractRecords);
      chunk.inserted += cResult.inserted;
      chunk.skipped += cResult.skipped;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      chunk.error = chunk.error ? `${chunk.error}; contracts: ${msg}` : `contracts: ${msg}`;
      anyChunkFailed = true;
      logger.error(
        { source: SOURCE_KEY, chunk_start: startStr, chunk_end: endStr, group: 'contracts', error: msg },
        'usaspending_backfill_chunk_error',
      );
    }

    try {
      const idvRecords = await fetchGroup('idvs', IDV_TYPE_CODES, startStr, endStr);
      chunk.idvs_rows = idvRecords.length;
      const iResult = await upsertPage(idvRecords);
      chunk.inserted += iResult.inserted;
      chunk.skipped += iResult.skipped;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      chunk.error = chunk.error ? `${chunk.error}; idvs: ${msg}` : `idvs: ${msg}`;
      anyChunkFailed = true;
      logger.error(
        { source: SOURCE_KEY, chunk_start: startStr, chunk_end: endStr, group: 'idvs', error: msg },
        'usaspending_backfill_chunk_error',
      );
    }

    totalInserted += chunk.inserted;
    totalSkipped += chunk.skipped;

    logger.info(
      {
        source: SOURCE_KEY,
        chunk_start: startStr,
        chunk_end: endStr,
        contracts_rows: chunk.contracts_rows,
        idvs_rows: chunk.idvs_rows,
        running_total: totalInserted,
      },
      'usaspending_backfill_chunk',
    );

    chunks.push(chunk);
    chunkStart = chunkEnd;
  }

  const durationMs = Date.now() - start;
  const status = anyChunkFailed ? 'degraded' : 'success';

  await finishRun(
    runId,
    status,
    { inserted: totalInserted, updated: 0, skipped: totalSkipped },
    anyChunkFailed ? 'one or more chunks failed' : undefined,
  );

  return {
    run_id: String(runId),
    days,
    total_inserted: totalInserted,
    total_skipped: totalSkipped,
    duration_ms: durationMs,
    chunks,
  };
}
