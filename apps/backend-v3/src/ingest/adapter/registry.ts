/**
 * Adapter registry — centralised dispatch for SourceAdapter instances.
 *
 * Each source self-registers via registerAdapter(). The cron scheduler
 * and admin endpoints use listAdapters() / getAdapter() instead of
 * referencing source-specific code directly.
 *
 * The existing framework registry (registerSource / runIngest) remains
 * the execution backbone — registerAdapter() bridges into it so all
 * run-logging and scheduling continue to work unchanged.
 */

import { logger } from '../../lib/logger.js';
import { registerSource, type IngestFn } from '../framework/registry.js';
import type { SourceAdapter } from './types.js';

interface RegisteredAdapter {
  adapter: SourceAdapter;
  label: string;
}

const adapters = new Map<string, RegisteredAdapter>();

/**
 * Register an adapter and bridge it into the framework registry.
 *
 * @param adapter       Concrete SourceAdapter instance
 * @param label         Human-readable label for logging
 * @param ingestFn      The existing job function that handles fetch+normalize+upsert.
 *                      Passed through to the framework so runIngest(key) still works.
 * @param frameworkKey  Override the framework registry key (e.g. 'sam.gov' vs 'sam').
 *                      Defaults to adapter.source.
 * @param adapterKey    Override the adapter map key when multiple adapters share a source
 *                      (e.g. 'govwin.forecast' vs 'govwin.solicitation').
 *                      Defaults to adapter.source.
 */
export function registerAdapter(
  adapter: SourceAdapter,
  label: string,
  ingestFn: IngestFn,
  frameworkKey?: string,
  adapterKey?: string,
): void {
  const mapKey = adapterKey ?? adapter.source;
  adapters.set(mapKey, { adapter, label });

  const fwKey = frameworkKey ?? adapter.source;
  registerSource(fwKey, label, ingestFn);

  logger.debug(
    { source: adapter.source, stage: adapter.defaultStage, frameworkKey: fwKey, adapterKey: mapKey },
    'adapter_registered',
  );
}

export function getAdapter(source: string): SourceAdapter | undefined {
  return adapters.get(source)?.adapter;
}

export function listAdapters(): Array<{ source: string; label: string; defaultStage: string }> {
  return Array.from(adapters.values()).map((r) => ({
    source: r.adapter.source,
    label: r.label,
    defaultStage: r.adapter.defaultStage,
  }));
}
