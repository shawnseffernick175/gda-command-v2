/**
 * Simple concurrency limiter for enrichment pipelines.
 *
 * Prevents unbounded parallel SAM/USAspending lookups from overwhelming
 * external APIs during poll ingestion (GovTribe + GovWin).
 */

export function createConcurrencyLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      if (queue.length > 0) {
        queue.shift()!();
      }
    }
  };
}

/** Default enrichment concurrency: 5 parallel SAM/USAspending lookups */
export const ENRICHMENT_CONCURRENCY = 5;
