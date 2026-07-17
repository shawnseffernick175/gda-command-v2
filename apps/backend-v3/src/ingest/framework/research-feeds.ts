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
