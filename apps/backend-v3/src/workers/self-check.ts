import type pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

export interface SelfCheckMetrics {
  total_current: number;
  with_llm: number;
  errored: number;
  stub_remaining: number;
  last_written: string | null;
}

export interface SelfCheckResult {
  healthy: boolean;
  reason: string | null;
  metrics: SelfCheckMetrics;
}

/**
 * Periodic analyzer self-check (canary).
 * Queries the DB to verify the analyzer is producing real output,
 * logs health status, and optionally fires an alert webhook on UNHEALTHY.
 */
export async function runAnalyzerSelfCheck(pool: pg.Pool): Promise<SelfCheckResult> {
  const version = config.analysisVersion;

  const { rows } = await pool.query<{
    total_current: string;
    with_llm: string;
    errored: string;
    stub_remaining: string;
    last_written: string | null;
  }>(`
    SELECT
      (SELECT count(*) FROM opportunities WHERE analysis_version = $1)::text AS total_current,
      (SELECT count(*) FROM opportunities WHERE analysis_version = $1 AND analysis->'llm_analysis' IS NOT NULL)::text AS with_llm,
      (SELECT count(*) FROM opportunities WHERE analysis_version = $1 AND analysis->>'llm_error_kind' IS NOT NULL)::text AS errored,
      -- Passed/dispositioned opportunities (assessment_status='pass') are intentionally
      -- not analyzed and must never count as analyzer backlog.
      (SELECT count(*) FROM opportunities
        WHERE (analysis_version IS NULL OR analysis_version LIKE '%stub%')
          AND assessment_status IS DISTINCT FROM 'pass'
      )::text AS stub_remaining,
      (SELECT max(ai_analyzed_at) FROM opportunities)::text AS last_written
  `, [version]);

  const row = rows[0]!;
  const metrics: SelfCheckMetrics = {
    total_current: parseInt(row.total_current, 10),
    with_llm: parseInt(row.with_llm, 10),
    errored: parseInt(row.errored, 10),
    stub_remaining: parseInt(row.stub_remaining, 10),
    last_written: row.last_written,
  };

  const result = evaluateHealth(metrics);

  if (result.healthy) {
    logger.info(
      { ...metrics },
      '[selfcheck] analyzer healthy',
    );
  } else {
    logger.error(
      { ...metrics, reason: result.reason },
      '[selfcheck] analyzer UNHEALTHY',
    );
    await fireWebhook(result.reason!, metrics);
  }

  return result;
}

function evaluateHealth(metrics: SelfCheckMetrics): SelfCheckResult {
  const { total_current, with_llm, errored, stub_remaining, last_written } = metrics;

  if (total_current === 0) {
    return { healthy: false, reason: 'no opportunities on current analysis version', metrics };
  }

  const llmRatio = with_llm / total_current;
  if (llmRatio < 0.8) {
    return {
      healthy: false,
      reason: `llm_analysis coverage ${(llmRatio * 100).toFixed(1)}% < 80% threshold`,
      metrics,
    };
  }

  const errorRatio = errored / total_current;
  if (errorRatio > 0.2) {
    return {
      healthy: false,
      reason: `error rate ${(errorRatio * 100).toFixed(1)}% > 20% threshold`,
      metrics,
    };
  }

  if (stub_remaining > 0 && last_written) {
    const lastWrittenDate = new Date(last_written);
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    if (lastWrittenDate < sixHoursAgo) {
      return {
        healthy: false,
        reason: `worker stalled: last_written ${last_written} is >6h ago with ${stub_remaining} stubs remaining`,
        metrics,
      };
    }
  }

  return { healthy: true, reason: null, metrics };
}

async function fireWebhook(reason: string, metrics: SelfCheckMetrics): Promise<void> {
  const url = process.env['ALERT_WEBHOOK_URL'];
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[GDA selfcheck] UNHEALTHY: ${reason} | total=${metrics.total_current} llm=${metrics.with_llm} errors=${metrics.errored} stubs=${metrics.stub_remaining} last=${metrics.last_written}`,
      }),
    });
  } catch (err) {
    logger.warn({ err, url }, '[selfcheck] alert webhook POST failed');
  }
}
