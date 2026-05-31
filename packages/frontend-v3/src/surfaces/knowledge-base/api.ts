import { apiFetch } from '../../lib/api-client';
import type { KbDocument, SearchResult, RagStatus, DocType, OuTag } from './types';

const BASE = '/v3/rag';

export async function fetchRagStatus(): Promise<RagStatus> {
  return apiFetch<RagStatus>(`${BASE}/status`);
}

export async function fetchDocuments(filters?: {
  ou?: OuTag;
  doc_type?: DocType;
  limit?: number;
}): Promise<KbDocument[]> {
  const params = new URLSearchParams();
  if (filters?.ou) params.set('ou', filters.ou);
  if (filters?.doc_type) params.set('doc_type', filters.doc_type);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const path = qs ? `${BASE}/documents?${qs}` : `${BASE}/documents`;
  return apiFetch<KbDocument[]>(path);
}

export async function deleteDocument(id: string): Promise<void> {
  await apiFetch(`${BASE}/documents/${id}`, { method: 'DELETE' });
}

export async function reingestDocument(id: string): Promise<void> {
  await apiFetch(`${BASE}/reingest/${id}`, { method: 'POST' });
}

export async function searchRag(
  query: string,
  opts?: { ou_filter?: OuTag; doc_type_filter?: DocType; top_k?: number },
): Promise<{ results: SearchResult[] }> {
  return apiFetch<{ results: SearchResult[] }>(`${BASE}/search`, {
    method: 'POST',
    body: JSON.stringify({
      query,
      ou_filter: opts?.ou_filter,
      doc_type_filter: opts?.doc_type_filter,
      top_k: opts?.top_k ?? 8,
    }),
  });
}
