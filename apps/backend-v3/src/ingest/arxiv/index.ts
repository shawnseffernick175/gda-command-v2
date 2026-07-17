/**
 * arXiv ingest module — registers the arXiv defense/tech papers
 * source with the ingest framework.
 */

import { registerSource } from '../framework/registry.js';
import { isResearchFeedsEnabled } from '../framework/research-feeds.js';
import { runArxivIngest } from './job.js';

export function registerArxivSource(): void {
  if (!isResearchFeedsEnabled()) return;
  registerSource('arxiv', 'arXiv Defense/Tech Papers', runArxivIngest);
}
