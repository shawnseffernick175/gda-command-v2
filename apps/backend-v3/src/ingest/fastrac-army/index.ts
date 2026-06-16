/**
 * FasTrac Army Installation ingest module — Tier 1.
 * Registers with the framework so the cron scheduler can invoke it.
 */

import { registerSource } from '../framework/registry.js';
import { runFastracArmyIngest } from './job.js';

export function registerFastracArmySource(): void {
  registerSource(
    'fastrac-army',
    'FasTrac Tier 1 Army Installation & Unit Signals',
    runFastracArmyIngest,
  );
}
