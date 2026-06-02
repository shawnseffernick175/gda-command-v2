/**
 * DoD RSS ingest module — registers the DoD contract announcements
 * source with the ingest framework.
 */

import { registerSource } from '../framework/registry.js';
import { runDoDRSSIngest } from './job.js';

export function registerDoDRSSSource(): void {
  registerSource('dod_rss', 'DoD Contract Announcements', runDoDRSSIngest);
}
