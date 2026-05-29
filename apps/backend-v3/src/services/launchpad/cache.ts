/**
 * Per-user 30-second launchpad response cache with invalidation support.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const TTL_MS = 30_000;

const summaryCache = new Map<string, CacheEntry<unknown>>();
const flagsCache = new Map<string, CacheEntry<unknown>>();

export function getSummaryCache<T>(userId: string): T | null {
  const entry = summaryCache.get(userId);
  if (!entry || Date.now() > entry.expiresAt) {
    summaryCache.delete(userId);
    return null;
  }
  return entry.data as T;
}

export function setSummaryCache<T>(userId: string, data: T): void {
  summaryCache.set(userId, { data, expiresAt: Date.now() + TTL_MS });
}

export function getFlagsCache<T>(userId: string): T | null {
  const entry = flagsCache.get(userId);
  if (!entry || Date.now() > entry.expiresAt) {
    flagsCache.delete(userId);
    return null;
  }
  return entry.data as T;
}

export function setFlagsCache<T>(userId: string, data: T): void {
  flagsCache.set(userId, { data, expiresAt: Date.now() + TTL_MS });
}

export function invalidateAllCaches(): void {
  summaryCache.clear();
  flagsCache.clear();
}
