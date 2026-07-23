/**
 * Shared feature flag for the early-signal research feeds
 * (nsf, arxiv, nih, sbir, dod_rss).
 *
 * Lane-relevant rows from these feeds now sync into the FasTrac technology
 * pipeline (see ingest/fastrac/tech_sync.ts, added in #1169), so they are no
 * longer pure noise. The master flag stays off by default so the feeds are
 * opt-in per environment; per-feed gates below allow finer control. Original
 * context: GitHub issue #1132.
 */
export function isResearchFeedsEnabled(): boolean {
  return process.env['RESEARCH_FEEDS_ENABLED'] === 'true';
}

/**
 * Per-feed gate for arXiv. Defaults ON (when research feeds are enabled) so
 * behavior is unchanged, but `ENABLE_ARXIV_INGEST=false` throttles just arXiv
 * off — it is by far the highest-volume feed (~1,600 rows, ~200/week) and can
 * dominate the opportunities table. The other feeds are unaffected.
 */
export function isArxivIngestEnabled(): boolean {
  return process.env['ENABLE_ARXIV_INGEST'] !== 'false';
}

/**
 * Per-feed gate for NSF. Defaults ON (when research feeds are enabled). The
 * feed previously returned 0 records because it queried award *start date*
 * (a future project-start, rarely inside a recent window) and OR-joined all 8
 * keywords into one request (NSF silently returns 0 for 4+ OR clauses). Both
 * are fixed in client.ts: it now filters on award `date` and queries one
 * keyword at a time, yielding ~100 real defense/tech awards per week. Set
 * `ENABLE_NSF_INGEST=false` to disable just NSF.
 */
export function isNsfIngestEnabled(): boolean {
  return process.env['ENABLE_NSF_INGEST'] !== 'false';
}
