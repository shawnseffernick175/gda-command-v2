/**
 * DoD RSS ingest module — registers the DoD contract announcements
 * source with the ingest framework.
 */

import { registerSource } from '../framework/registry.js';
import { isResearchFeedsEnabled } from '../framework/research-feeds.js';
import { runDoDRSSIngest } from './job.js';

export function registerDoDRSSSource(): void {
  if (!isResearchFeedsEnabled()) return;
  registerSource('dod_rss', 'DoD Contract Announcements', runDoDRSSIngest);
}
