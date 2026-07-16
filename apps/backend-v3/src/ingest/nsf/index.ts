/**
 * NSF ingest module — registers the NSF research awards source
 * with the ingest framework.
 */

import { registerSource } from '../framework/registry.js';
import { isResearchFeedsEnabled } from '../framework/research-feeds.js';
import { runNSFIngest } from './job.js';

export function registerNSFSource(): void {
  if (!isResearchFeedsEnabled()) return;
  registerSource('nsf', 'NSF Research Awards', runNSFIngest);
}
