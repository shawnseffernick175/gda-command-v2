/**
 * FPDS ingest module — registers the FPDS source with the framework.
 */

import { registerSource } from '../framework/registry.js';
import { runFPDSIngest } from './job.js';

export function registerFPDSSource(): void {
  registerSource('fpds.gov', 'FPDS Awards', runFPDSIngest);
}
