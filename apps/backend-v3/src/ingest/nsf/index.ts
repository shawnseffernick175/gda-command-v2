/**
 * NSF ingest module — registers the NSF research awards source
 * with the ingest framework.
 */

import { registerSource } from '../framework/registry.js';
import { runNSFIngest } from './job.js';

export function registerNSFSource(): void {
  registerSource('nsf', 'NSF Research Awards', runNSFIngest);
}
