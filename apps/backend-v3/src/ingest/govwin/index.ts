/**
 * GovWin IQ ingest module — registers the GovWin source with
 * the ingest framework. Gated behind GOVWIN_CONNECTOR_V1 env flag.
 */

import { registerSource } from '../framework/registry.js';
import { runGovWinIngest } from './job.js';

export function registerGovWinSource(): void {
  registerSource('govwin', 'GovWin IQ Opportunities', runGovWinIngest);
}
