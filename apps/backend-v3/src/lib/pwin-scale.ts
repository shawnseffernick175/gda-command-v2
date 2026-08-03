/**
 * Pwin scale — the single accessor for converting the canonical stored pwin
 * into the 0–100 percent the API/UI expect.
 *
 * Storage conventions (audited, issue #849 + assessment finding A2):
 *   • Canonical pwin is a 0..1 FRACTION:
 *       - opportunity_analysis_cache.pwin
 *       - pipeline_items.pwin_override
 *       - wheelhouse_config.default_stage_pwin
 *   • Percent-scale copies are already 0..100:
 *       - pipeline_items.win_probability
 *       - unified_opportunities.pwin
 *
 * Any reader that surfaces a fraction as a percent MUST go through
 * `pwinFractionToPct` rather than hand-rolling `* 100`, so a 0..1 value can
 * never leak into a 0..100 field again (the ~100× understatement this file
 * exists to prevent).
 */

/** Convert a canonical 0..1 fraction to a 0..100 percent (rounded). */
export function pwinFractionToPct(
  frac: number | string | null | undefined,
): number | null {
  if (frac === null || frac === undefined) return null;
  const n = typeof frac === 'string' ? Number(frac) : frac;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export type PwinBand = 'high' | 'medium' | 'low';

/**
 * Pipeline coverage band from a 0..100 pwin.
 * Thresholds: ≥70 high, ≥40 medium, >0 low, otherwise null.
 */
export function pwinBandFromPct(
  pct: number | string | null | undefined,
): PwinBand | null {
  if (pct === null || pct === undefined) return null;
  const n = typeof pct === 'string' ? Number(pct) : pct;
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 70) return 'high';
  if (n >= 40) return 'medium';
  return 'low';
}
