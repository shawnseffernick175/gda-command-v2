import { useFastTrackHistory, useFastTrackById } from './api';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function useRecentHistory(cursor: string | null = null, limit = 25) {
  const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  return useFastTrackHistory(since, cursor, limit);
}

export { useFastTrackById };
