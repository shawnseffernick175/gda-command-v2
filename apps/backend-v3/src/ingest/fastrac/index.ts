/**
 * FasTrac Tier 1 ingest module — registers the innovation org signal
 * ingestion source with the ingest framework.
 */

import { registerSource } from '../framework/registry.js';
import { runFasTracTier1Ingest } from './job.js';

export function registerFasTracTier1Source(): void {
  registerSource('fastrac.tier1', 'FasTrac Tier 1 Innovation Orgs', runFasTracTier1Ingest);
}
