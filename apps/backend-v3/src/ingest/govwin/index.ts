/**
 * GovWin IQ ingest module — registers the GovWin forecast adapter
 * with the adapter registry. The solicitation adapter is available
 * but not auto-scheduled until an explicit cron entry is added.
 *
 * Gated behind GOVWIN_CONNECTOR_V1 env flag.
 */

import { registerAdapter } from '../adapter/registry.js';
import { GovWinForecastAdapter } from './adapter.js';
import { runGovWinIngest } from './job.js';

export function registerGovWinSource(): void {
  registerAdapter(new GovWinForecastAdapter(), runGovWinIngest);
}
