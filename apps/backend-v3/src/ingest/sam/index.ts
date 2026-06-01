/**
 * SAM.gov ingest module — registers the SAM adapter with both the
 * adapter registry and the framework (via registerAdapter bridge).
 */

import { registerAdapter } from '../adapter/registry.js';
import { SamSolicitationAdapter } from './adapter.js';
import { runSAMIngest } from './job.js';

export function registerSAMSource(): void {
  registerAdapter(new SamSolicitationAdapter(), runSAMIngest);
}
