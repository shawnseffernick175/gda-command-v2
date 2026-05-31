import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../../lib/api-client';
import type {
  FastTrackInput,
  FastTrackResult,
  FastTrackHistoryResponse,
  SubmitOutcome,
} from './types';

async function submitFastTrack(input: FastTrackInput): Promise<SubmitOutcome> {
  try {
    const data = await apiFetch<FastTrackResult>('/v3/fast-track', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return { kind: 'result', data };
  } catch (err) {
    if (err instanceof ApiError && err.status === 503 && err.code === 'ANALYSIS_TIMEOUT') {
      return { kind: 'timeout' };
    }
    throw err;
  }
}

async function fetchHistory(since: string, cursor: string | null, limit: number): Promise<FastTrackHistoryResponse> {
  const params = new URLSearchParams({ since, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiFetch<FastTrackHistoryResponse>(`/v3/fast-track?${params.toString()}`);
}

async function fetchById(id: string): Promise<FastTrackResult> {
  return apiFetch<FastTrackResult>(`/v3/fast-track/${id}`);
}

export function useFastTrackSubmit() {
  const queryClient = useQueryClient();

  return useMutation<SubmitOutcome, Error, FastTrackInput>({
    mutationFn: submitFastTrack,
    onSuccess: (outcome) => {
      if (outcome.kind === 'result') {
        queryClient.invalidateQueries({ queryKey: ['fast-track', 'history'] });
      }
    },
  });
}

export function useFastTrackHistory(since: string, cursor: string | null, limit = 25) {
  return useQuery({
    queryKey: ['fast-track', 'history', since, cursor],
    queryFn: () => fetchHistory(since, cursor, limit),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useFastTrackById(id: string | null) {
  return useQuery({
    queryKey: ['fast-track', id],
    queryFn: () => fetchById(id!),
    enabled: !!id,
  });
}
