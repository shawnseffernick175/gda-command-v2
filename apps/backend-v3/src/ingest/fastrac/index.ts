/**
 * FasTrac Tier 1 ingest module — registers the innovation org signal
 * ingestion source with the ingest framework.
 */

import { registerSource } from '../framework/registry.js';
import { runFasTracTier1Ingest } from './job.js';
import { runFastracTechSync } from './tech_sync.js';

export function registerFasTracTier1Source(): void {
  registerSource('fastrac.tier1', 'FasTrac Tier 1 Innovation Orgs', runFasTracTier1Ingest);
}

/**
 * FasTrac technology-pipeline sync — mirrors lane-relevant research-feed
 * opportunities (arXiv/NSF/NIH/SBIR) into fast_track_signals(pipeline='tech').
 * Only meaningful when the research feeds are enabled.
 */
export function registerFastracTechSyncSource(): void {
  registerSource('fastrac.tech-sync', 'FasTrac Tech Pipeline Sync', runFastracTechSync);
}
