import { apiFetch } from '../../lib/api-client';
import type { RegulatoryListResult, RegulatoryListFilters } from './types';

const API_BASE = '/v3/regulatory-notices';

function buildQueryString(filters: RegulatoryListFilters): string {
  const params = new URLSearchParams();
  if (filters.agency) params.set('agency', filters.agency);
  if (filters.published_after) params.set('published_after', filters.published_after);
  if (filters.published_before) params.set('published_before', filters.published_before);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.cursor) params.set('cursor', filters.cursor);
  return params.toString();
}

export async function fetchRegulatoryNotices(
  filters: RegulatoryListFilters,
): Promise<RegulatoryListResult> {
  const qs = buildQueryString(filters);
  const path = qs ? `${API_BASE}?${qs}` : API_BASE;
  return apiFetch<RegulatoryListResult>(path);
}

export async function fetchRegulatoryCount(): Promise<number> {
  try {
    const data = await apiFetch<{ count: number }>(`${API_BASE}/count`);
    return data.count;
  } catch {
    return 0;
  }
}
