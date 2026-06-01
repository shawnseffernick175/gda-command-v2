/**
 * Adapter registry — register SourceAdapter implementations and
 * dispatch by source key. Bridges to the framework registry so
 * runIngest(sourceKey) continues to work.
 */

import type { AdapterMeta, SourceAdapter } from './types.js';
import { registerSource, type IngestFn } from '../framework/registry.js';

const adapters = new Map<string, AdapterMeta>();

/**
 * Register an adapter with the adapter registry AND the framework
 * registry (so runIngest(sourceKey) resolves it).
 *
 * @param adapter  Concrete adapter instance
 * @param ingestFn The function that performs the full ingest cycle.
 *                 Typically wraps fetchRecent → normalize → upsert.
 */
export function registerAdapter<TRaw>(
  adapter: SourceAdapter<TRaw>,
  ingestFn: IngestFn,
): void {
  adapters.set(adapter.source, adapter);
  const label = `${adapter.source} (${adapter.defaultStage})`;
  registerSource(adapter.source, label, ingestFn);
}

/** Return metadata for every registered adapter. */
export function listAdapters(): AdapterMeta[] {
  return Array.from(adapters.values());
}

/** Look up adapter metadata by source key (returns undefined if missing). */
export function getAdapter(source: string): AdapterMeta | undefined {
  return adapters.get(source);
}

/** Look up adapter metadata by source key (throws if missing). */
export function dispatchAdapter(source: string): AdapterMeta {
  const adapter = adapters.get(source);
  if (!adapter) {
    throw new Error(`No adapter registered for source: ${source}`);
  }
  return adapter;
}
