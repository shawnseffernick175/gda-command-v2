import type { SuccessEnvelope } from '../opportunities/types';
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
  const url = qs ? `${API_BASE}?${qs}` : API_BASE;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch regulatory notices: ${res.status}`);
  }
  const envelope = (await res.json()) as SuccessEnvelope<RegulatoryListResult>;
  return envelope.data;
}

export async function fetchRegulatoryCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/count`);
  if (!res.ok) return 0;
  const envelope = (await res.json()) as SuccessEnvelope<{ count: number }>;
  return envelope.data.count;
}
