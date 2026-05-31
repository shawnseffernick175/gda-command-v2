import type { AwardListFilters, AwardsListResponse, SuccessEnvelope } from './types';

const API_BASE = '/v3/awards';

function buildQueryString(filters: AwardListFilters): string {
  const params = new URLSearchParams();
  if (filters.agency) params.set('agency', filters.agency);
  if (filters.contract_type) params.set('contract_type', filters.contract_type);
  if (filters.awarded_after) params.set('awarded_after', filters.awarded_after);
  if (filters.awarded_before) params.set('awarded_before', filters.awarded_before);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.cursor) params.set('cursor', filters.cursor);
  return params.toString();
}

export async function fetchAwards(filters: AwardListFilters): Promise<AwardsListResponse> {
  const qs = buildQueryString(filters);
  const url = qs ? `${API_BASE}?${qs}` : API_BASE;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch awards: ${res.status}`);
  }
  const envelope = (await res.json()) as SuccessEnvelope<AwardsListResponse>;
  return envelope.data;
}

export async function fetchAwardsCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/count`);
  if (!res.ok) return 0;
  const envelope = (await res.json()) as SuccessEnvelope<{ count: number }>;
  return envelope.data.count;
}
