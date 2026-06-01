/**
 * GovTribe ingest module — registers GovTribe sources with the framework.
 *
 * The GovTribeSolicitationAdapter is registered with the adapter registry
 * as a stub (blocked by F-323). The existing ingest jobs continue to run
 * through the framework registry for opportunities, contacts, vehicles,
 * and budget rollup.
 *
 * Gated behind ENABLE_GOVTRIBE_INGEST env flag (default: true when
 * GOVTRIBE_API_KEY is set).
 */

import { registerSource } from '../framework/registry.js';
import { registerAdapter } from '../adapter/registry.js';
import { GovTribeSolicitationAdapter } from './adapter.js';
import {
  runGovTribeOppsIngest,
  runGovTribeContactsIngest,
  runGovTribeVehiclesIngest,
  runGovTribeBudgetRollup,
} from './job.js';

export function registerGovTribeSource(): void {
  // Adapter registry: stub adapter (full migration waits on F-323)
  registerAdapter(new GovTribeSolicitationAdapter(), runGovTribeOppsIngest);

  // Framework registry: remaining sub-sources (not yet adapter-ized)
  registerSource('govtribe.contacts', 'GovTribe Agency Contacts', runGovTribeContactsIngest);
  registerSource('govtribe.vehicles', 'GovTribe Contract Vehicles', runGovTribeVehiclesIngest);
  registerSource('govtribe.budget', 'GovTribe Budget Rollup', runGovTribeBudgetRollup);
}
