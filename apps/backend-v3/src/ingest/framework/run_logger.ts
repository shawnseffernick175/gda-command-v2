/**
 * Ingest run logger — records each ingest invocation in the
 * `ingest_runs` table for observability and audit.
 */

import { pool } from '../../lib/db.js';
import type { IngestResult } from './registry.js';

export async function startRun(sourceKey: string): Promise<bigint> {
  const { rows } = await pool.query(
    `INSERT INTO ingest_runs (source_key, started_at, status)
     VALUES ($1, NOW(), 'running')
     RETURNING id`,
    [sourceKey],
  );
  return BigInt(rows[0].id);
}

export async function finishRun(
  runId: bigint,
  status: 'success' | 'error' | 'degraded',
  result: IngestResult,
  errorText?: string,
): Promise<void> {
  await pool.query(
    `UPDATE ingest_runs
     SET finished_at    = NOW(),
         rows_inserted  = $1,
         rows_updated   = $2,
         rows_skipped   = $3,
         status         = $4,
         error_text     = $5
     WHERE id = $6`,
    [result.inserted, result.updated, result.skipped, status, errorText ?? null, String(runId)],
  );
}

export interface IngestRunRow {
  id: string;
  source_key: string;
  started_at: string;
  finished_at: string | null;
  rows_inserted: number;
  rows_updated: number;
  rows_skipped: number;
  status: string;
  error_text: string | null;
  created_at: string;
}

export async function getRecentRuns(
  sourceKey?: string,
  limit = 50,
): Promise<IngestRunRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (sourceKey) {
    params.push(sourceKey);
    conditions.push(`source_key = $${params.length}`);
  }

  params.push(Math.min(limit, 200));

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT id, source_key, started_at, finished_at,
            rows_inserted, rows_updated, rows_skipped,
            status, error_text, created_at
     FROM ingest_runs
     ${where}
     ORDER BY started_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}

export interface IngestStatusRow {
  source_key: string;
  last_success_at: string | null;
  lag_seconds: number | null;
}

export async function getIngestStatus(): Promise<IngestStatusRow[]> {
  const { rows } = await pool.query(
    `SELECT source_key,
            MAX(finished_at) FILTER (WHERE status IN ('success', 'degraded')) AS last_success_at,
            EXTRACT(EPOCH FROM (NOW() - MAX(finished_at) FILTER (WHERE status IN ('success', 'degraded'))))::INT AS lag_seconds
     FROM ingest_runs
     GROUP BY source_key
     ORDER BY source_key`,
  );
  return rows;
}

export interface IngestInsertStatusRow {
  source_key: string;
  /** Last run that actually authenticated AND wrote rows (success + rows > 0). */
  last_insert_at: string | null;
  /** Whether this source has ever written rows — distinguishes a source that
   *  legitimately produces no new rows on a poll from one that never returns data. */
  ever_inserted: boolean;
}

/**
 * Per-source "did it actually return data" status. A run is only counted as a
 * successful insert when its status is 'success' AND it wrote rows. 'degraded'
 * runs (e.g. an auth failure caught and reported as degraded) are NOT counted,
 * so a source that is 401ing/inserting 0 rows will not look fresh.
 */
export async function getIngestInsertStatus(): Promise<IngestInsertStatusRow[]> {
  const { rows } = await pool.query(
    `SELECT source_key,
            MAX(finished_at) FILTER (
              WHERE status = 'success' AND (rows_inserted + rows_updated) > 0
            ) AS last_insert_at,
            COALESCE(
              bool_or(status = 'success' AND (rows_inserted + rows_updated) > 0),
              false
            ) AS ever_inserted
     FROM ingest_runs
     GROUP BY source_key
     ORDER BY source_key`,
  );
  return rows;
}
