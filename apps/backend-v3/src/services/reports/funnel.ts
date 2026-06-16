/**
 * F-441 — Conversion funnel report (read-only aggregation).
 *
 * Produces a snapshot of the opportunity pipeline as a funnel,
 * plus signal-band distribution and operator decision activity.
 * All queries are COUNT/GROUP BY — safe on empty data.
 */

import type pg from 'pg';
import { recommendStatus } from '../pwin/promotion.js';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface FunnelStageCount { stage: string; count: number; }
export interface ConversionRate { from: string; to: string; rate: number; }

export interface LifecycleFunnel {
  stages: FunnelStageCount[];
  total: number;
  qualified_count: number;
  hot_count: number;
  conversions: ConversionRate[];
}

export interface SignalFunnel {
  scored: number;
  bands: Array<{ band: 'discovery' | 'signal' | 'forecast'; count: number }>;
  note?: string;
}

export interface DecisionActivity {
  window_days: number;
  by_action: Array<{ action: string; count: number }>;
  open_review_queue: number;
  decided_total: number;
  avg_decision_age_hours: number | null;
}

export interface FunnelReport {
  generated_at: string;
  lifecycle: LifecycleFunnel;
  signal_funnel: SignalFunnel;
  decisions: DecisionActivity;
}

// ── Constants ───────────────────────────────────────────────────────────────

export const CANONICAL_STAGES = [
  'discovery', 'tracking', 'qualifying', 'qualified', 'no_bid', 'closed', 'awarded',
] as const;

const SIGNAL_BANDS = ['discovery', 'signal', 'forecast'] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

function clampWindow(raw: number | undefined): number {
  const d = raw ?? 30;
  return Math.max(1, Math.min(365, d));
}

// ── Builder ─────────────────────────────────────────────────────────────────

export async function buildFunnelReport(
  pool: pg.Pool,
  opts?: { window_days?: number },
): Promise<FunnelReport> {
  const windowDays = clampWindow(opts?.window_days);

  // 1. Lifecycle stage counts
  const stageRes = await pool.query<{ status: string; cnt: string }>(
    `SELECT status, count(*) AS cnt FROM opportunities WHERE deleted_at IS NULL GROUP BY status`,
  );
  const countMap = new Map<string, number>();
  for (const r of stageRes.rows) countMap.set(r.status, Number(r.cnt));

  const stages: FunnelStageCount[] = CANONICAL_STAGES.map((s) => ({
    stage: s,
    count: countMap.get(s) ?? 0,
  }));
  const total = stages.reduce((sum, s) => sum + s.count, 0);

  // 2. Qualified count
  const qualRes = await pool.query<{ cnt: string }>(
    `SELECT count(*) AS cnt FROM opportunities WHERE qualified_at IS NOT NULL AND deleted_at IS NULL`,
  );
  const qualified_count = Number(qualRes.rows[0]?.cnt ?? 0);

  // 3. Hot count (Pwin >= 70%)
  const hotRes = await pool.query<{ cnt: string }>(
    `SELECT count(*) AS cnt FROM opportunities o
     WHERE o.deleted_at IS NULL
       AND EXISTS(SELECT 1 FROM opportunity_analysis_cache ac WHERE ac.opportunity_id = o.id AND ac.pwin >= 0.70)`,
  );
  const hot_count = Number(hotRes.rows[0]?.cnt ?? 0);

  // 4. Conversions (snapshot adjacent-stage ratios)
  const conversions: ConversionRate[] = [];
  for (let i = 0; i < stages.length - 1; i++) {
    const from = stages[i]!;
    const to = stages[i + 1]!;
    conversions.push({
      from: from.stage,
      to: to.stage,
      rate: from.count === 0 ? 0 : to.count / from.count,
    });
  }

  // 5. Signal funnel — bucket pwin scores via recommendStatus
  const pwinRes = await pool.query<{ score_text: string | null }>(
    `SELECT analysis->'pwin'->>'score' AS score_text FROM opportunities WHERE deleted_at IS NULL`,
  );
  const bandCounts: Record<string, number> = { discovery: 0, signal: 0, forecast: 0 };
  let scored = 0;
  for (const r of pwinRes.rows) {
    const raw = r.score_text;
    if (raw === null || raw === undefined) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    scored++;
    const band = recommendStatus(n);
    bandCounts[band]++;
  }
  const signal_funnel: SignalFunnel = {
    scored,
    bands: SIGNAL_BANDS.map((b) => ({ band: b, count: bandCounts[b]! })),
  };
  if (scored === 0) signal_funnel.note = 'no scored opportunities yet';

  // 6. Decision activity
  const auditRes = await pool.query<{ action: string; cnt: string }>(
    `SELECT action, count(*) AS cnt FROM audit_log WHERE created_at >= now() - ($1 || ' days')::interval GROUP BY action`,
    [String(windowDays)],
  );
  const by_action = auditRes.rows.map((r) => ({ action: r.action, count: Number(r.cnt) }));

  const openRes = await pool.query<{ cnt: string }>(
    `SELECT count(*) AS cnt FROM unified_opportunity_links WHERE confidence IN ('MEDIUM','LOW')`,
  );
  const open_review_queue = Number(openRes.rows[0]?.cnt ?? 0);

  const decidedRes = await pool.query<{ cnt: string }>(
    `SELECT count(*) AS cnt FROM unified_opportunity_links WHERE confidence IN ('CONFIRMED','REJECTED')`,
  );
  const decided_total = Number(decidedRes.rows[0]?.cnt ?? 0);

  const ageRes = await pool.query<{ avg_hours: string | null }>(
    `SELECT AVG(EXTRACT(EPOCH FROM (confirmed_at - matched_at))/3600) AS avg_hours
     FROM unified_opportunity_links
     WHERE confidence IN ('CONFIRMED','REJECTED')
       AND confirmed_at IS NOT NULL
       AND matched_at IS NOT NULL`,
  );
  const rawAge = ageRes.rows[0]?.avg_hours;
  const avg_decision_age_hours = rawAge !== null && rawAge !== undefined ? Number(rawAge) : null;

  return {
    generated_at: new Date().toISOString(),
    lifecycle: { stages, total, qualified_count, hot_count, conversions },
    signal_funnel,
    decisions: {
      window_days: windowDays,
      by_action,
      open_review_queue,
      decided_total,
      avg_decision_age_hours,
    },
  };
}
