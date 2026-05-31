/**
 * Federal Register ingest module — registers the Federal Register
 * source with the ingest framework.
 */

import { registerSource } from '../framework/registry.js';
import { runFederalRegisterIngest } from './job.js';

export function registerFederalRegisterSource(): void {
  registerSource(
    'federalregister.gov',
    'Federal Register (regulatory notices)',
    runFederalRegisterIngest,
  );
}
