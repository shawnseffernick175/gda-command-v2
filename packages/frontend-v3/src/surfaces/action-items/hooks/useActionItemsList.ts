import { useQuery } from '@tanstack/react-query';
import type { ActionItemListResponse, ActionItemFilters } from '../types';

const API_BASE = '/v3/action-items';

async function fetchActionItems(
  filters: ActionItemFilters,
  limit: number,
  cursor?: string,
): Promise<ActionItemListResponse['data']> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  if (filters.status) params.set('status', filters.status);
  if (filters.source) params.set('source', filters.source);
  if (filters.owner) params.set('owner', filters.owner);
  if (filters.linked_record_type) params.set('linked_record_type', filters.linked_record_type);

  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch action items: ${res.status}`);
  const json: ActionItemListResponse = await res.json();
  return json.data;
}

export function useActionItemsList(
  filters: ActionItemFilters = {},
  limit = 50,
  cursor?: string,
) {
  return useQuery({
    queryKey: ['action-items', filters, limit, cursor],
    queryFn: () => fetchActionItems(filters, limit, cursor),
  });
}
