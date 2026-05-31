import { apiFetch } from '../../lib/api-client';
import type {
  ColorTeamRun,
  ColorTeamFinding,
  Document,
  DiffResult,
  ColorTeamColor,
} from './types';

export async function uploadDocument(body: {
  filename: string;
  storage_path: string;
  doc_type?: string;
  opportunity_id?: string;
}): Promise<Document> {
  return apiFetch<Document>('/v3/documents', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchDocuments(opts?: {
  limit?: number;
  offset?: number;
}): Promise<{ items: Document[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  const qs = params.toString();
  return apiFetch<{ items: Document[]; total: number }>(
    `/v3/documents${qs ? `?${qs}` : ''}`
  );
}

export async function fetchDocument(id: string): Promise<Document> {
  return apiFetch<Document>(`/v3/documents/${id}`);
}

export async function startColorTeamRun(body: {
  document_id: string;
  colors: ColorTeamColor[];
  linked_rfp_id?: string;
}): Promise<{ run_id: string; status: string }> {
  return apiFetch<{ run_id: string; status: string }>('/v3/color-teams/run', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchRun(runId: string): Promise<ColorTeamRun> {
  return apiFetch<ColorTeamRun>(`/v3/color-teams/runs/${runId}`);
}

export async function fetchRunFindings(
  runId: string,
  color?: string
): Promise<{ findings: ColorTeamFinding[]; total: number }> {
  const qs = color ? `?color=${color}` : '';
  return apiFetch<{ findings: ColorTeamFinding[]; total: number }>(
    `/v3/color-teams/runs/${runId}/findings${qs}`
  );
}

export async function fetchRunDiff(
  runId: string,
  againstRunId: string
): Promise<DiffResult> {
  return apiFetch<DiffResult>(
    `/v3/color-teams/runs/${runId}/diff?against=${againstRunId}`
  );
}

export async function sendFindingToActionItem(
  findingId: string
): Promise<{ action_item_id: string; finding_id: string }> {
  return apiFetch<{ action_item_id: string; finding_id: string }>(
    `/v3/color-teams/findings/${findingId}/to-action-item`,
    { method: 'POST' }
  );
}

export async function fetchDocumentRuns(
  docId: string
): Promise<{ runs: ColorTeamRun[]; total: number }> {
  return apiFetch<{ runs: ColorTeamRun[]; total: number }>(
    `/v3/color-teams/documents/${docId}/runs`
  );
}
