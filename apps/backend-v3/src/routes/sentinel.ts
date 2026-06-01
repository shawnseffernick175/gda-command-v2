/**
 * Sentinel routes — monitoring and health status for all ingest sources.
 *
 * GET /v3/sentinel/sources — Returns per-source health + GovTribe credit block.
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope } from '../lib/envelope.js';
import { getRegisteredSources } from '../ingest/framework/registry.js';
import { getIngestStatus } from '../ingest/framework/run_logger.js';
import { getCreditBudgetStatus } from '../ingest/govtribe/client.js';

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

export async function sentinelRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/sentinel/sources', async (req, reply) => {
    const registered = getRegisteredSources();
    const ingestStatus = await getIngestStatus();

    const ingestMap = new Map(ingestStatus.map((s) => [s.source_key, s]));

    let govtribeBudget = { credits_used: 0, credits_budget: 1200, pct: 0, last_call_at: null as string | null };
    try {
      govtribeBudget = await getCreditBudgetStatus();
    } catch {
      // Tables may not exist yet
    }

    const { rows: lastErrorRows } = await pool.query(
      `SELECT source_key, error_text
       FROM ingest_runs
       WHERE status = 'error'
         AND started_at > NOW() - INTERVAL '24 hours'
       ORDER BY started_at DESC`,
    );
    const recentErrors = new Map(lastErrorRows.map((r) => [r.source_key, r.error_text]));

    const entries: SentinelSourceEntry[] = registered.map((sourceKey) => {
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

      const entry: SentinelSourceEntry = {
        source_key: sourceKey,
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

    return reply.send(
      successEnvelope(
        {
          sources: entries,
          govtribe_severity: severity,
          govtribe_credits: govtribeBudget,
        },
        req.requestId,
      ),
    );
  });
}
