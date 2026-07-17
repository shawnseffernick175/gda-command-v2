/**
 * Sentinel routes — F-309: Handoff Monitor with plain-language summaries
 * and credit-pacing visibility.
 *
 * GET /v3/sentinel/sources           — Legacy per-source health (unchanged)
 * GET /v3/sentinel/handoffs          — Open handoffs (waiting on human)
 * GET /v3/sentinel/credit-pacing/govwin   — GovWin API call volume
 * GET /v3/sentinel/recent-wins       — Successful completions last 24h
 * GET /v3/sentinel/upcoming-breaks   — Credentials/secrets/certs about to expire
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope } from '../lib/envelope.js';
import { getRegisteredSourcesWithLabels } from '../ingest/framework/registry.js';
import { getIngestStatus } from '../ingest/framework/run_logger.js';
import { getAuthHealth } from '../services/govwin/auth.js';

/* ── Types ─────────────────────────────────────────────────────────── */

interface SentinelSourceEntry {
  source_key: string;
  status: 'healthy' | 'stale' | 'error' | 'unknown';
  last_success_at: string | null;
  lag_seconds: number | null;
  credits?: {
    used: number;
    budget: number;
    pct: number;
    last_call_at: string | null;
  };
  message?: string;
}

interface HandoffCard {
  id: string;
  title: string;
  context: string | null;
  action_label: string | null;
  action_url: string | null;
  severity: string;
  source_key: string | null;
  due_by: string | null;
  created_at: string;
}

interface RecentWinCard {
  id: string;
  title: string;
  context: string | null;
  source_key: string | null;
  created_at: string;
}

interface UpcomingBreakCard {
  id: string;
  title: string;
  context: string | null;
  action_label: string | null;
  action_url: string | null;
  severity: string;
  due_by: string | null;
  created_at: string;
}

interface CreditPacingGovWin {
  month: string;
  calls_mtd: number;
  avg_daily_calls: number;
  last_call_at: string | null;
  auth_status: {
    token_valid: boolean;
    expires_in_minutes: number;
  };
  top_endpoints: Array<{ endpoint: string; call_count: number }>;
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function deriveSentinelMessage(lagSeconds: number | null): string {
  if (lagSeconds === null) return 'No data yet';
  if (lagSeconds > 3600 * 12) return `Stale — last success ${Math.round(lagSeconds / 3600)}h ago`;
  return `Healthy — last poll ${Math.round(lagSeconds / 60)} min ago`;
}

/* ── Route registration ────────────────────────────────────────────── */

export async function sentinelRoutes(app: FastifyInstance): Promise<void> {

  /* ── GET /v3/sentinel/sources (legacy, unchanged) ─────────────────── */
  app.get('/v3/sentinel/sources', async (req, reply) => {
    const registered = getRegisteredSourcesWithLabels();
    const ingestStatus = await getIngestStatus();

    const ingestMap = new Map(ingestStatus.map((s) => [s.source_key, s]));

    const { rows: lastErrorRows } = await pool.query(
      `SELECT DISTINCT ON (source_key) source_key, error_text
       FROM ingest_runs e
       WHERE e.status = 'error'
         AND e.started_at > NOW() - INTERVAL '24 hours'
         AND NOT EXISTS (
           SELECT 1 FROM ingest_runs s
           WHERE s.source_key = e.source_key
             AND s.status IN ('success', 'degraded')
             AND s.started_at > e.started_at
         )
       ORDER BY source_key, started_at DESC`,
    );
    const recentErrors = new Map(lastErrorRows.map((r) => [r.source_key, r.error_text]));

    const entries: (SentinelSourceEntry & { label: string })[] = registered.map(({ key: sourceKey, label }) => {
      const ingest = ingestMap.get(sourceKey);
      const lagSeconds = ingest?.lag_seconds ?? null;
      const recentError = recentErrors.get(sourceKey);

      let status: SentinelSourceEntry['status'] = 'unknown';
      if (recentError) {
        status = 'error';
      } else if (ingest?.last_success_at) {
        status = (lagSeconds !== null && lagSeconds > 3600 * 12) ? 'stale' : 'healthy';
      }

      const message = recentError
        ? `Error: ${recentError.slice(0, 100)}`
        : deriveSentinelMessage(lagSeconds);

      const entry: SentinelSourceEntry & { label: string } = {
        source_key: sourceKey,
        label,
        status,
        last_success_at: ingest?.last_success_at ?? null,
        lag_seconds: lagSeconds,
        message,
      };

      return entry;
    });

    const CORE_SOURCES = ["sam.gov", "usaspending.gov", "govwin"];
    const coreEntries = entries.filter((e) => CORE_SOURCES.includes(e.source_key));
    const hasError = coreEntries.some((e) => e.status === 'error');
    const hasStale = coreEntries.some((e) => e.status === 'stale');
    const overall = hasError ? 'degraded' : hasStale ? 'degraded' : 'healthy';

    return reply.send(
      successEnvelope(
        {
          overall,
          sources: entries,
        },
        req.requestId,
      ),
    );
  });

  /* ── GET /v3/sentinel/handoffs ────────────────────────────────────── */
  app.get('/v3/sentinel/handoffs', async (req, reply) => {
    const { rows } = await pool.query<HandoffCard>(
      `SELECT id, title, context, action_label, action_url, severity,
              source_key, due_by::text, created_at::text
       FROM sentinel_events
       WHERE event_type = 'handoff' AND resolved_at IS NULL
       ORDER BY
         CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
         created_at DESC
       LIMIT 20`,
    );

    return reply.send(successEnvelope({ items: rows, count: rows.length }, req.requestId));
  });

  /* ── GET /v3/sentinel/credit-pacing/govwin ────────────────────────── */
  app.get('/v3/sentinel/credit-pacing/govwin', async (req, reply) => {
    // GovWin is flat-rate but we track API call volume
    const month = new Date().toISOString().slice(0, 7);

    const { rows: callRows } = await pool.query<{ calls_mtd: string; last_call_at: string | null }>(
      `SELECT COUNT(*)::text AS calls_mtd,
              MAX(started_at)::text AS last_call_at
       FROM ingest_runs
       WHERE source_key = 'govwin'
         AND started_at >= date_trunc('month', NOW())`,
    );

    const callsMtd = parseInt(callRows[0]?.calls_mtd ?? '0', 10);
    const lastCallAt = callRows[0]?.last_call_at ?? null;
    const dayOfMonth = new Date().getDate();
    const avgDailyCalls = dayOfMonth > 0 ? Math.round(callsMtd / dayOfMonth) : 0;

    // Top endpoints from ingest_runs metadata
    const { rows: topEndpoints } = await pool.query<{ endpoint: string; call_count: string }>(
      `SELECT
         COALESCE(error_text, 'sync') AS endpoint,
         COUNT(*)::text AS call_count
       FROM ingest_runs
       WHERE source_key = 'govwin'
         AND started_at >= date_trunc('month', NOW())
       GROUP BY COALESCE(error_text, 'sync')
       ORDER BY COUNT(*) DESC
       LIMIT 5`,
    );

    let authStatus = { token_valid: false, expires_in_minutes: 0 };
    try {
      const health = await getAuthHealth();
      authStatus = { token_valid: health.token_valid, expires_in_minutes: health.expires_in_minutes };
    } catch {
      // Auth table may not exist
    }

    const result: CreditPacingGovWin = {
      month,
      calls_mtd: callsMtd,
      avg_daily_calls: avgDailyCalls,
      last_call_at: lastCallAt,
      auth_status: authStatus,
      top_endpoints: topEndpoints.map((e) => ({
        endpoint: e.endpoint,
        call_count: parseInt(e.call_count, 10),
      })),
    };

    return reply.send(successEnvelope(result, req.requestId));
  });

  /* ── GET /v3/sentinel/recent-wins ─────────────────────────────────── */
  app.get('/v3/sentinel/recent-wins', async (req, reply) => {
    // Combine: sentinel_events of type 'win' + successful ingest_runs from last 24h
    const { rows: eventWins } = await pool.query<RecentWinCard>(
      `SELECT id, title, context, source_key, created_at::text
       FROM sentinel_events
       WHERE event_type = 'win'
         AND created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC
       LIMIT 10`,
    );

    // Summarize recent successful ingests as wins
    const { rows: ingestWins } = await pool.query<{
      source_key: string;
      last_success: string;
      run_count: string;
    }>(
      `SELECT source_key,
              MAX(finished_at)::text AS last_success,
              COUNT(*)::text AS run_count
       FROM ingest_runs
       WHERE status IN ('success', 'degraded')
         AND finished_at >= NOW() - INTERVAL '24 hours'
       GROUP BY source_key
       ORDER BY MAX(finished_at) DESC`,
    );

    const ingestSummaries: RecentWinCard[] = ingestWins.map((row) => ({
      id: `ingest-${row.source_key}`,
      title: `${row.source_key} completed ${row.run_count} successful sync${parseInt(row.run_count, 10) > 1 ? 's' : ''}`,
      context: `Last completed at ${row.last_success ? new Date(row.last_success).toLocaleString('en-US', { timeZone: 'America/New_York' }) : 'unknown'}`,
      source_key: row.source_key,
      created_at: row.last_success ?? new Date().toISOString(),
    }));

    const allWins = [...eventWins, ...ingestSummaries]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 15);

    return reply.send(successEnvelope({ items: allWins, count: allWins.length }, req.requestId));
  });

  /* ── GET /v3/sentinel/upcoming-breaks ─────────────────────────────── */
  app.get('/v3/sentinel/upcoming-breaks', async (req, reply) => {
    // From sentinel_events (type = 'break', unresolved)
    const { rows: breakEvents } = await pool.query<UpcomingBreakCard>(
      `SELECT id, title, context, action_label, action_url, severity,
              due_by::text, created_at::text
       FROM sentinel_events
       WHERE event_type = 'break' AND resolved_at IS NULL
       ORDER BY
         CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
         due_by ASC NULLS LAST
       LIMIT 20`,
    );

    const autoBreaks: UpcomingBreakCard[] = [];

    // Auto-detect: GovWin auth expiry
    try {
      const govwinHealth = await getAuthHealth();
      if (govwinHealth.token_valid && govwinHealth.expires_in_minutes < 60) {
        autoBreaks.push({
          id: 'auto-govwin-auth',
          title: `GovWin auth token expires in ${govwinHealth.expires_in_minutes} minutes`,
          context: 'Token will auto-refresh, but if refresh fails, GovWin sync stops.',
          action_label: 'Check GovWin credentials',
          action_url: null,
          severity: 'warning',
          due_by: null,
          created_at: new Date().toISOString(),
        });
      }
      if (!govwinHealth.token_valid) {
        autoBreaks.push({
          id: 'auto-govwin-auth-expired',
          title: 'GovWin auth token is expired or invalid',
          context: govwinHealth.last_error ?? 'Unable to authenticate with GovWin API. Sync is paused.',
          action_label: 'Re-authenticate GovWin',
          action_url: null,
          severity: 'critical',
          due_by: null,
          created_at: new Date().toISOString(),
        });
      }
    } catch {
      // Ignore if govwin auth table doesn't exist
    }

    const allBreaks = [...breakEvents, ...autoBreaks]
      .sort((a, b) => {
        const sevOrder = { critical: 0, warning: 1, info: 2 };
        const aSev = sevOrder[a.severity as keyof typeof sevOrder] ?? 2;
        const bSev = sevOrder[b.severity as keyof typeof sevOrder] ?? 2;
        if (aSev !== bSev) return aSev - bSev;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    return reply.send(successEnvelope({ items: allBreaks, count: allBreaks.length }, req.requestId));
  });
}
