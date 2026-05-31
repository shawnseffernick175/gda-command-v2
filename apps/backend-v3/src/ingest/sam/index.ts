/**
 * SAM.gov ingest module — registers the SAM source with the framework.
 */

import { registerSource } from '../framework/registry.js';
import { runSAMIngest } from './job.js';

export function registerSAMSource(): void {
  registerSource('sam.gov', 'SAM.gov Opportunities', runSAMIngest);
}
