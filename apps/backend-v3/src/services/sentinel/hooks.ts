/**
 * Sentinel hooks — F-309
 *
 * Every plumbing failure (cron miss, API 429, auth 401, secret expiry warning)
 * creates a sentinel_event that gets summarized into plain English.
 *
 * Usage:
 *   import { recordSentinelEvent } from '../services/sentinel/hooks.js';
 *   await recordSentinelEvent({ ... });
 */

import { pool } from '../../lib/db.js';
import { summarizeEvent } from './summarize-event.js';
import type { RawSentinelEvent } from './summarize-event.js';

export type SentinelEventType = 'handoff' | 'win' | 'break' | 'info';

export interface RecordSentinelEventInput {
  event_type: SentinelEventType;
  source_key?: string;
  alert_type: string;
  component: string;
  details: string;
  log_lines?: string[];
  error_code?: number;
  action_url?: string;
  due_by?: Date;
  raw_event?: unknown;
}

/**
 * Record a sentinel event with plain-language summary.
 * Deduplicates by (source_key, alert_type) within 1 hour to avoid flooding.
 */
export async function recordSentinelEvent(input: RecordSentinelEventInput): Promise<string | null> {
  // Dedup: skip if same source_key + alert_type within last hour (unresolved)
  if (input.source_key) {
    const { rows: existing } = await pool.query(
      `SELECT id FROM sentinel_events
       WHERE source_key = $1
         AND title LIKE '%' || $2 || '%'
         AND resolved_at IS NULL
         AND created_at > NOW() - INTERVAL '1 hour'
       LIMIT 1`,
      [input.source_key, input.component],
    );
    if (existing.length > 0) {
      return null; // Already recorded recently
    }
  }

  const rawEvent: RawSentinelEvent = {
    alert_type: input.alert_type,
    component: input.component,
    details: input.details,
    log_lines: input.log_lines,
    error_code: input.error_code,
    source_key: input.source_key,
  };

  const summary = await summarizeEvent(rawEvent);

  const { rows } = await pool.query(
    `INSERT INTO sentinel_events
       (event_type, severity, source_key, title, context, action_label, action_url, raw_event, due_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.event_type,
      summary.severity,
      input.source_key ?? null,
      summary.title,
      summary.context,
      summary.action_label ?? null,
      input.action_url ?? summary.action_url ?? null,
      input.raw_event ? JSON.stringify(input.raw_event) : null,
      input.due_by ?? null,
    ],
  );

  return rows[0]?.id ?? null;
}

/**
 * Record a successful operation as a "win" event.
 */
export async function recordSentinelWin(input: {
  source_key: string;
  title: string;
  context?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO sentinel_events (event_type, severity, source_key, title, context)
     VALUES ('win', 'info', $1, $2, $3)`,
    [input.source_key, input.title, input.context ?? null],
  );
}

/**
 * Resolve all open sentinel events for a given source_key.
 */
export async function resolveSentinelEvents(sourceKey: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE sentinel_events
     SET resolved_at = NOW(), updated_at = NOW()
     WHERE source_key = $1 AND resolved_at IS NULL`,
    [sourceKey],
  );
  return rowCount ?? 0;
}

/**
 * Hook for ingest framework: called when an ingest run fails.
 */
export async function onIngestFailure(
  sourceKey: string,
  errorText: string,
  errorCode?: number,
): Promise<void> {
  let alertType = 'api_error';
  if (errorCode === 429) alertType = 'rate_limit';
  else if (errorCode === 401 || errorCode === 403) alertType = 'auth_failure';

  await recordSentinelEvent({
    event_type: errorCode === 401 || errorCode === 403 ? 'handoff' : 'break',
    source_key: sourceKey,
    alert_type: alertType,
    component: sourceKey,
    details: errorText,
    error_code: errorCode,
    raw_event: { error_text: errorText, error_code: errorCode, timestamp: new Date().toISOString() },
  });
}

/**
 * Hook for ingest framework: called when an ingest run succeeds.
 * Resolves any open break/handoff events for that source.
 */
export async function onIngestSuccess(sourceKey: string): Promise<void> {
  await resolveSentinelEvents(sourceKey);
}
