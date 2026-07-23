/**
 * Shared feature flag for the early-signal research feeds
 * (nsf, arxiv, nih, sbir, dod_rss).
 *
 * These connectors produce no data any product read-path consumes, do not
 * feed the RAG index, and only generate scheduled no-op jobs plus health-panel
 * noise. They are disabled by default and gated behind a single env flag so the
 * prior behavior is fully restorable. See GitHub issue #1132.
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
 * Per-feed gate for NSF. Defaults OFF: the NSF Awards API is queried by award
 * *start date* within a 7-day lookback (see ingest/nsf/job.ts + client.ts), and
 * award start dates rarely fall inside a recent 7-day window, so the feed
 * reliably returns 0 records — it only adds scheduled no-op runs and
 * health-panel noise. Set `ENABLE_NSF_INGEST=true` to re-enable once the query
 * window is corrected to fix the zero-result behavior.
 */
export function isNsfIngestEnabled(): boolean {
  return process.env['ENABLE_NSF_INGEST'] === 'true';
}
