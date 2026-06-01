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

interface RegisterAdapterOpts {
  frameworkKey?: string;
  adapterKey?: string;
  /** Skip the framework registerSource() bridge. Use when multiple adapters
   *  share one framework source key (e.g. GovWin forecast + solicitation). */
  skipFramework?: boolean;
}

/**
 * Register an adapter and (optionally) bridge it into the framework registry.
 */
export function registerAdapter(
  adapter: SourceAdapter,
  label: string,
  ingestFn: IngestFn,
  opts?: RegisterAdapterOpts,
): void {
  const mapKey = opts?.adapterKey ?? adapter.source;
  adapters.set(mapKey, { adapter, label });

  if (!opts?.skipFramework) {
    const fwKey = opts?.frameworkKey ?? adapter.source;
    registerSource(fwKey, label, ingestFn);
  }

  logger.debug(
    { source: adapter.source, stage: adapter.defaultStage, adapterKey: mapKey },
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
