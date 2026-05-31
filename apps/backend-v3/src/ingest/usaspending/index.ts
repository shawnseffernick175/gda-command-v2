/**
 * USAspending ingest module — registers the USAspending source with
 * the ingest framework.
 */

import { registerSource } from '../framework/registry.js';
import { runUSASpendingIngest } from './job.js';

export function registerUSASpendingSource(): void {
  registerSource('usaspending.gov', 'USAspending Awards', runUSASpendingIngest);
}
