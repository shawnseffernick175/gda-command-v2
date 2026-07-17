/**
 * NIH ingest module — registers the NIH RePORTER research awards
 * source with the ingest framework.
 */

import { registerSource } from '../framework/registry.js';
import { isResearchFeedsEnabled } from '../framework/research-feeds.js';
import { runNIHIngest } from './job.js';

export function registerNIHSource(): void {
  if (!isResearchFeedsEnabled()) return;
  registerSource('nih', 'NIH RePORTER Research Awards', runNIHIngest);
}
