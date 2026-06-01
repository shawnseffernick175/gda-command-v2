/**
 * GovTribe ingest module — registers the GovTribe adapter + sub-source
 * framework entries for contacts/vehicles/budget.
 *
 * Uses MCP over Streamable HTTP (https://govtribe.com/mcp).
 * Gated behind ENABLE_GOVTRIBE_INGEST env flag (default: true when
 * GOVTRIBE_API_KEY is set).
 */

import { registerAdapter } from '../adapter/registry.js';
import { registerSource } from '../framework/registry.js';
import { GovTribeSolicitationAdapter } from './adapter.js';
import {
  runGovTribeOppsIngest,
  runGovTribeContactsIngest,
  runGovTribeVehiclesIngest,
  runGovTribeBudgetRollup,
} from './job.js';

export function registerGovTribeSource(): void {
  registerAdapter(
    new GovTribeSolicitationAdapter(),
    'GovTribe Opportunities',
    runGovTribeOppsIngest,
    { frameworkKey: 'govtribe' },
  );

  // Sub-sources use the framework directly — they are not adapters
  // (contacts, vehicles, budget have no SourceAdapter equivalent yet).
  registerSource('govtribe.contacts', 'GovTribe Agency Contacts', runGovTribeContactsIngest);
  registerSource('govtribe.vehicles', 'GovTribe Contract Vehicles', runGovTribeVehiclesIngest);
  registerSource('govtribe.budget', 'GovTribe Budget Rollup', runGovTribeBudgetRollup);
}
