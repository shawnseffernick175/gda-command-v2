/**
 * SAM.gov ingest module — registers the SAM adapter + bridges to the framework.
 */

import { registerAdapter } from '../adapter/registry.js';
import { SamSolicitationAdapter } from './adapter.js';
import { runSAMIngest } from './job.js';

export function registerSAMSource(): void {
  registerAdapter(
    new SamSolicitationAdapter(),
    'SAM.gov Solicitations',
    runSAMIngest,
    { frameworkKey: 'sam.gov' },
  );
}
