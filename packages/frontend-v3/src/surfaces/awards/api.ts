import { apiFetch } from '../../lib/api-client';
import type { AwardListFilters, AwardsListResponse } from './types';

const API_PATH = '/v3/awards';

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
  const path = qs ? `${API_PATH}?${qs}` : API_PATH;
  return apiFetch<AwardsListResponse>(path);
}

export async function fetchAwardsCount(): Promise<number> {
  const data = await apiFetch<{ count: number }>(`${API_PATH}/count`);
  return data.count;
}
