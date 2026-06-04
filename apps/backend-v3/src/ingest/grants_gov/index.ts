/**
 * Grants.gov ingest module — registers the Grants.gov source
 * with the ingest framework.
 */

import { registerSource } from '../framework/registry.js';
import { runGrantsGovIngest } from './job.js';

export function registerGrantsGovSource(): void {
  registerSource('grants.gov', 'Grants.gov Open Opportunities', runGrantsGovIngest);
}
