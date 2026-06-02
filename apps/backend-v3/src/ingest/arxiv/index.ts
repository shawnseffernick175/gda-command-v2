/**
 * arXiv ingest module — registers the arXiv defense/tech papers
 * source with the ingest framework.
 */

import { registerSource } from '../framework/registry.js';
import { runArxivIngest } from './job.js';

export function registerArxivSource(): void {
  registerSource('arxiv', 'arXiv Defense/Tech Papers', runArxivIngest);
}
