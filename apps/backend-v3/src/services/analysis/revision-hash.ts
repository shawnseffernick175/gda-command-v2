/**
 * Opportunity revision hash — single source of truth.
 *
 * A short content fingerprint of the analysis-affecting fields of an
 * opportunity. Two opportunities with the same hash have identical
 * analysis inputs, so re-running the (expensive) LLM analysis would
 * produce the same result and can be skipped.
 *
 * Used by:
 *   - services/analysis/pipeline.ts — brief cache invalidation
 *   - workers/analysis.ts — stored on the opportunity at analysis time,
 *     then compared by the periodic-refresh sweep to avoid redundant,
 *     costly re-analysis of unchanged opportunities.
 */

import crypto from 'crypto';

/** The analysis-affecting fields that define an opportunity revision. */
export interface RevisionHashInput {
  title: unknown;
  description: unknown;
  agency: unknown;
  naics: unknown;
  set_aside: unknown;
  value_min: unknown;
  value_max: unknown;
  response_due_at: unknown;
  incumbent: unknown;
}

export function computeRevisionHash(row: RevisionHashInput): string {
  const payload = JSON.stringify({
    title: row.title ?? null,
    description: row.description ?? null,
    agency: row.agency ?? null,
    naics: row.naics ?? null,
    set_aside: row.set_aside ?? null,
    value_min: row.value_min ?? null,
    value_max: row.value_max ?? null,
    response_due_at: row.response_due_at ?? null,
    incumbent: row.incumbent ?? null,
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}
