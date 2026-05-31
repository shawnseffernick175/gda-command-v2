/**
 * Ingest source registry — register per-source ingest modules
 * and expose a single `runIngest(sourceKey)` entry point.
 */

import { log } from "../../lib/logger";
import { startRun, finishRun } from "./run_logger";

export interface IngestResult {
  inserted: number;
  updated: number;
  skipped: number;
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
    log.info("ingest_started", { source: sourceKey, run_id: String(runId) });

    const result = await source.ingest();

    const durationMs = Date.now() - start;
    await finishRun(runId, "success", result);

    log.info("ingest_completed", {
      source: sourceKey,
      run_id: String(runId),
      rows_inserted: result.inserted,
      rows_updated: result.updated,
      rows_skipped: result.skipped,
      durationMs,
    });

    return { runId, result, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorText = err instanceof Error ? err.message : String(err);
    await finishRun(runId, "error", { inserted: 0, updated: 0, skipped: 0 }, errorText);

    log.error("ingest_failed", {
      source: sourceKey,
      run_id: String(runId),
      error: errorText,
      durationMs,
    });

    throw err;
  }
}
