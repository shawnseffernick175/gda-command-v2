/**
 * DIBBS ingest module — registers the DIBBS source with the framework.
 */

import { registerSource } from '../framework/registry.js';
import { runDIBBSIngest } from './job.js';

export function registerDIBBSSource(): void {
  registerSource('dibbs', 'DIBBS (DLA Internet Bid Board System)', runDIBBSIngest);
}
