import type {
  PipelineListResponse,
  PipelineDetailResponse,
  PipelineListParams,
  PipelineStage,
  TeamingRole,
  PipelinePartner,
  PartnerDirectoryEntry,
} from './types';

const BASE = '/v3/pipeline';

function buildQuery(params: PipelineListParams): string {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  if (params.sort) qs.set('sort', params.sort);
  if (params.filter) {
    if (params.filter.stage?.length)
      qs.set('filter.stage', params.filter.stage.join(','));
    if (params.filter.teaming?.length)
      qs.set('filter.teaming', params.filter.teaming.join(','));
    if (params.filter.agency) qs.set('filter.agency', params.filter.agency);
    if (params.filter.naics) qs.set('filter.naics', params.filter.naics);
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function fetchPipelineList(
  params: PipelineListParams,
): Promise<PipelineListResponse> {
  return request<PipelineListResponse>(`${BASE}${buildQuery(params)}`);
}

export function fetchPipelineDetail(
  id: string,
): Promise<PipelineDetailResponse> {
  return request<PipelineDetailResponse>(`${BASE}/${id}`);
}

export function advanceStage(
  id: string,
  stage: PipelineStage,
): Promise<PipelineDetailResponse> {
  return request<PipelineDetailResponse>(`${BASE}/${id}/advance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  });
}

export function updateTeaming(
  id: string,
  payload: { teaming: TeamingRole; partners: PipelinePartner[] },
): Promise<PipelineDetailResponse> {
  return request<PipelineDetailResponse>(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function fetchPartners(): Promise<{ data: PartnerDirectoryEntry[] }> {
  return request<{ data: PartnerDirectoryEntry[] }>('/v3/partners');
}
