/**
 * Ingest source registry — register per-source ingest modules
 * and expose a single `runIngest(sourceKey)` entry point.
 */

import { logger } from '../../lib/logger.js';
import { startRun, finishRun } from './run_logger.js';

export interface IngestResult {
  inserted: number;
  updated: number;
  skipped: number;
  degraded?: boolean;
  degradedReason?: string;
}

export type IngestFn = () => Promise<IngestResult>;

interface RegisteredSource {
  key: string;
  label: string;
  ingest: IngestFn;
}

const sources = new Map<string, RegisteredSource>();

export function registerSource(key: string, label: string, ingest: IngestFn): void {
  sources.set(key, { key, label, ingest });
}

export function getRegisteredSources(): string[] {
  return Array.from(sources.keys());
}

export async function runIngest(sourceKey: string): Promise<{
  runId: bigint;
  result: IngestResult;
  durationMs: number;
}> {
  const source = sources.get(sourceKey);
  if (!source) {
    throw new Error(`Unknown ingest source: ${sourceKey}`);
  }

  const runId = await startRun(sourceKey);
  const start = Date.now();

  try {
    logger.info({ source: sourceKey, runId: String(runId) }, 'ingest_started');

    const result = await source.ingest();

    const durationMs = Date.now() - start;
    const status = result.degraded ? 'degraded' : 'success';
    await finishRun(runId, status, result, result.degradedReason);

    logger.info(
      {
        source: sourceKey,
        runId: String(runId),
        rowsInserted: result.inserted,
        rowsUpdated: result.updated,
        rowsSkipped: result.skipped,
        durationMs,
      },
      'ingest_completed',
    );

    return { runId, result, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorText = err instanceof Error ? err.message : String(err);
    await finishRun(runId, 'error', { inserted: 0, updated: 0, skipped: 0 }, errorText);

    logger.error(
      {
        source: sourceKey,
        runId: String(runId),
        error: errorText,
        durationMs,
      },
      'ingest_failed',
    );

    throw err;
  }
}
