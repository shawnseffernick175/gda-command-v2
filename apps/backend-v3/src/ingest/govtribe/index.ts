/**
 * GovTribe ingest module — registers GovTribe sources with the framework.
 * Uses MCP over Streamable HTTP (https://govtribe.com/mcp).
 * Gated behind ENABLE_GOVTRIBE_INGEST env flag (default: true when
 * GOVTRIBE_API_KEY is set).
 */

import { registerSource } from '../framework/registry.js';
import {
  runGovTribeOppsIngest,
  runGovTribeContactsIngest,
  runGovTribeVehiclesIngest,
  runGovTribeBudgetRollup,
} from './job.js';

export function registerGovTribeSource(): void {
  registerSource('govtribe', 'GovTribe Opportunities', runGovTribeOppsIngest);
  registerSource('govtribe.contacts', 'GovTribe Agency Contacts', runGovTribeContactsIngest);
  registerSource('govtribe.vehicles', 'GovTribe Contract Vehicles', runGovTribeVehiclesIngest);
  registerSource('govtribe.budget', 'GovTribe Budget Rollup', runGovTribeBudgetRollup);
}
