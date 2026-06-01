/**
 * GovWin IQ ingest module — registers forecast + solicitation adapters
 * and bridges to the framework. Gated behind GOVWIN_CONNECTOR_V1 env flag.
 *
 * Both adapters share the same fetch path and cron job (runGovWinIngest).
 * The framework key 'govwin' maps to a single cron schedule; the adapter
 * registry tracks both for dispatch and metadata queries.
 */

import { registerAdapter } from '../adapter/registry.js';
import { GovWinForecastAdapter, GovWinSolicitationAdapter } from './adapter.js';
import { runGovWinIngest } from './job.js';

export function registerGovWinSource(): void {
  registerAdapter(
    new GovWinForecastAdapter(),
    'GovWin IQ Forecasts',
    runGovWinIngest,
    'govwin',
    'govwin.forecast',
  );

  // Solicitation adapter shares the same framework job — register it
  // in the adapter map only, under a separate key.
  registerAdapter(
    new GovWinSolicitationAdapter(),
    'GovWin IQ Solicitations',
    runGovWinIngest,
    'govwin.solicitations',
    'govwin.solicitation',
  );
}
