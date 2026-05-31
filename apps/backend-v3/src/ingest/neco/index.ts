/**
 * NECO ingest module — registers the NECO source with the framework.
 */

import { registerSource } from '../framework/registry.js';
import { runNECOIngest } from './job.js';

export function registerNECOSource(): void {
  registerSource('neco', 'NECO (Navy Electronic Commerce Online)', runNECOIngest);
}
