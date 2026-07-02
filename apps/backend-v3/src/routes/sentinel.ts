/**
 * Sentinel routes — F-309: Handoff Monitor with plain-language summaries
 * and credit-pacing visibility.
 *
 * GET /v3/sentinel/sources           — Legacy per-source health (unchanged)
 * GET /v3/sentinel/handoffs          — Open handoffs (waiting on human)
 * GET /v3/sentinel/credit-pacing/govtribe — GovTribe credit pacing detail
 * GET /v3/sentinel/credit-pacing/govwin   — GovWin API call volume
 * GET /v3/sentinel/recent-wins       — Successful completions last 24h
 * GET /v3/sentinel/upcoming-breaks   — Credentials/secrets/certs about to expire
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope } from '../lib/envelope.js';
import { getRegisteredSourcesWithLabels } from '../ingest/framework/registry.js';
import { getIngestStatus } from '../ingest/framework/run_logger.js';
import { getCreditBudgetStatus, getDailyBudgetStatus } from '../ingest/govtribe/mcp_client.js';
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

interface CreditPacingGovTribe {
  month: string;
  credits_used: number;
  credits_budget: number;
  pct: number;
  burn_rate_7d: number;
  projected_exhaustion_date: string | null;
  days_remaining_in_month: number;
  daily_allowance: number;
  today_spent: number;
  top_queries: Array<{ tool_name: string; credits: number; call_count: number }>;
  daily_burn_history: Array<{ date: string; credits: number }>;
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

function deriveSentinelMessage(
  sourceKey: string,
  pct: number,
  lagSeconds: number | null,
): string {
  if (sourceKey !== 'govtribe' && !sourceKey.startsWith('govtribe.')) {
    if (lagSeconds === null) return 'No data yet';
    if (lagSeconds > 3600 * 12) return `Stale — last success ${Math.round(lagSeconds / 3600)}h ago`;
    return `Healthy — last poll ${Math.round(lagSeconds / 60)} min ago`;
  }

  const lagMsg = lagSeconds !== null
    ? `Last opps poll ${Math.round(lagSeconds / 60)} min ago.`
    : 'No polls yet.';

  if (pct >= 95) {
    return `GovTribe at ${pct}% of 1200/mo budget — STOPPED auto-polling. Only opp detail on user request. ${lagMsg}`;
  }
  if (pct >= 80) {
    const now = new Date();
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    return `GovTribe at ${pct}% of 1200/mo budget — ${daysLeft} days left in month. Restricting to on-demand calls only. ${lagMsg}`;
  }
  if (pct >= 50) {
    return `GovTribe at ${pct}% of 1200/mo credit budget — pacing on track. ${lagMsg}`;
  }

  return `GovTribe at ${pct}% of 1200/mo credit budget. ${lagMsg}`;
}

function deriveSeverity(pct: number): 'ok' | 'warning' | 'critical' {
  if (pct >= 95) return 'critical';
  if (pct >= 80) return 'warning';
  return 'ok';
}

/* ── Route registration ────────────────────────────────────────────── */

export async function sentinelRoutes(app: FastifyInstance): Promise<void> {

  /* ── GET /v3/sentinel/sources (legacy, unchanged) ─────────────────── */
  app.get('/v3/sentinel/sources', async (req, reply) => {
    const registered = getRegisteredSourcesWithLabels();
    const ingestStatus = await getIngestStatus();

    const ingestMap = new Map(ingestStatus.map((s) => [s.source_key, s]));

    let govtribeBudget = { credits_used: 0, credits_budget: 1200, pct: 0, last_call_at: null as string | null };
    try {
      govtribeBudget = await getCreditBudgetStatus();
    } catch {
      // Tables may not exist yet
    }

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

      const isGovTribe = sourceKey === 'govtribe' || sourceKey.startsWith('govtribe.');

      const pct = isGovTribe ? govtribeBudget.pct : 0;
      const message = isGovTribe
        ? deriveSentinelMessage(sourceKey, pct, lagSeconds)
        : recentError
          ? `Error: ${recentError.slice(0, 100)}`
          : deriveSentinelMessage(sourceKey, 0, lagSeconds);

      const entry: SentinelSourceEntry & { label: string } = {
        source_key: sourceKey,
        label,
        status,
        last_success_at: ingest?.last_success_at ?? null,
        lag_seconds: lagSeconds,
        message,
      };

      if (isGovTribe) {
        entry.credits = {
          used: govtribeBudget.credits_used,
          budget: govtribeBudget.credits_budget,
          pct: govtribeBudget.pct,
          last_call_at: govtribeBudget.last_call_at,
        };
      }

      return entry;
    });

    const govtribeEntry = entries.find((e) => e.source_key === 'govtribe');
    const severity = govtribeEntry ? deriveSeverity(govtribeBudget.pct) : 'ok';

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
          govtribe_severity: severity,
          govtribe_credits: govtribeBudget,
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

  /* ── GET /v3/sentinel/credit-pacing/govtribe ──────────────────────── */
  app.get('/v3/sentinel/credit-pacing/govtribe', async (req, reply) => {
    let budgetStatus = { month: '', credits_used: 0, credits_budget: 1200, pct: 0, last_call_at: null as string | null };
    try {
      budgetStatus = await getCreditBudgetStatus();
    } catch {
      // Table not yet created
    }

    const dailyStatus = await getDailyBudgetStatus(budgetStatus);

    // Burn rate: average daily credits over last 7 days
    const { rows: burnRows } = await pool.query<{ daily_avg: string }>(
      `SELECT COALESCE(
         ROUND(SUM(cost_credits)::numeric / GREATEST(1, COUNT(DISTINCT created_at::date)), 1),
         0
       ) AS daily_avg
       FROM govtribe_credit_ledger
       WHERE decision = 'called'
         AND created_at >= NOW() - INTERVAL '7 days'`,
    );
    const burnRate7d = parseFloat(burnRows[0]?.daily_avg ?? '0');

    // Projected exhaustion date
    let projectedExhaustionDate: string | null = null;
    if (burnRate7d > 0) {
      const remaining = budgetStatus.credits_budget - budgetStatus.credits_used;
      const daysUntilExhaustion = Math.ceil(remaining / burnRate7d);
      const exhaustionDate = new Date();
      exhaustionDate.setDate(exhaustionDate.getDate() + daysUntilExhaustion);
      projectedExhaustionDate = exhaustionDate.toISOString().slice(0, 10);
    }

    // Top consuming queries (by tool_name)
    const { rows: topQueries } = await pool.query<{ tool_name: string; credits: string; call_count: string }>(
      `SELECT endpoint AS tool_name,
              SUM(cost_credits)::text AS credits,
              COUNT(*)::text AS call_count
       FROM govtribe_credit_ledger
       WHERE decision = 'called'
         AND created_at >= date_trunc('month', NOW())
       GROUP BY endpoint
       ORDER BY SUM(cost_credits) DESC
       LIMIT 5`,
    );

    // 7-day daily burn history for sparkline
    const { rows: dailyBurnRows } = await pool.query<{ day: string; credits: string }>(
      `SELECT created_at::date::text AS day,
              COALESCE(SUM(cost_credits), 0)::text AS credits
       FROM govtribe_credit_ledger
       WHERE decision = 'called'
         AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY created_at::date
       ORDER BY created_at::date ASC`,
    );

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemainingInMonth = daysInMonth - now.getDate();

    const result: CreditPacingGovTribe = {
      month: budgetStatus.month || new Date().toISOString().slice(0, 7),
      credits_used: budgetStatus.credits_used,
      credits_budget: budgetStatus.credits_budget,
      pct: budgetStatus.pct,
      burn_rate_7d: burnRate7d,
      projected_exhaustion_date: projectedExhaustionDate,
      days_remaining_in_month: daysRemainingInMonth,
      daily_allowance: dailyStatus.dailyAllowance,
      today_spent: dailyStatus.todaySpent,
      top_queries: topQueries.map((q) => ({
        tool_name: q.tool_name,
        credits: parseInt(q.credits, 10),
        call_count: parseInt(q.call_count, 10),
      })),
      daily_burn_history: dailyBurnRows.map((r) => ({
        date: r.day,
        credits: parseFloat(r.credits),
      })),
    };

    return reply.send(successEnvelope(result, req.requestId));
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

    // Auto-detect: GovTribe credit exhaustion risk
    const autoBreaks: UpcomingBreakCard[] = [];
    try {
      const budget = await getCreditBudgetStatus();
      if (budget.pct >= 80) {
        const now = new Date();
        const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
        autoBreaks.push({
          id: 'auto-govtribe-credits',
          title: `GovTribe credits at ${budget.pct}% — ${daysLeft} days remain in billing cycle`,
          context: `Used ${budget.credits_used} of ${budget.credits_budget} monthly credits. At current pace, credits may run out before month end.`,
          action_label: 'Top up credits',
          action_url: 'https://govtribe.com/account/billing',
          severity: budget.pct >= 95 ? 'critical' : 'warning',
          due_by: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
          created_at: now.toISOString(),
        });
      }
    } catch {
      // Ignore
    }

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
