/**
 * SBIR/STTR ingest module — registers the DoD DSIP (dodsbirsttr.mil)
 * source with the ingest framework.
 */

import { registerSource } from '../framework/registry.js';
import { runSBIRIngest } from './job.js';

export function registerSBIRSource(): void {
  registerSource('sbir', 'DoD SBIR/STTR Open Topics', runSBIRIngest);
}
