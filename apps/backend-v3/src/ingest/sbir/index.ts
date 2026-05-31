/**
 * SBIR/STTR ingest module — registers the SBIR.gov source with
 * the ingest framework.
 */

import { registerSource } from '../framework/registry.js';
import { runSBIRIngest } from './job.js';

export function registerSBIRSource(): void {
  registerSource('sbir.gov', 'SBIR/STTR Awards + Topics', runSBIRIngest);
}
