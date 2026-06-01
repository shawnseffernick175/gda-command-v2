/**
 * Adapter registry — maps source keys to their SourceAdapter implementation.
 */

import type { SourceAdapter } from './types.js';
import { samAdapter } from './sam_adapter.js';
import { govtribeAdapter } from './govtribe_adapter.js';
import { govwinAdapter } from './govwin_adapter.js';

const adapters = new Map<string, SourceAdapter>();

function register(adapter: SourceAdapter): void {
  adapters.set(adapter.source, adapter);
}

register(samAdapter);
register(govtribeAdapter);
register(govwinAdapter);

export function getAdapter(source: string): SourceAdapter | undefined {
  return adapters.get(source);
}

export function listAdapters(): SourceAdapter[] {
  return [...adapters.values()];
}

/**
 * Resolve which adapter handles a given `data_source` value from the
 * legacy opportunities table.
 */
export function resolveAdapterForDataSource(dataSource: string): SourceAdapter | undefined {
  const lower = dataSource.toLowerCase();
  if (lower.includes('sam')) return adapters.get('sam');
  if (lower.includes('govtribe')) return adapters.get('govtribe');
  if (lower.includes('govwin')) return adapters.get('govwin');
  return undefined;
}
