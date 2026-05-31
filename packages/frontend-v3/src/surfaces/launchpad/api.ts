import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api-client';
import type { LaunchpadSummary, LaunchpadFlagsResult } from './types';

async function fetchSummary(): Promise<LaunchpadSummary> {
  return apiFetch<LaunchpadSummary>('/v3/launchpad/summary');
}

async function fetchFlags(): Promise<LaunchpadFlagsResult> {
  return apiFetch<LaunchpadFlagsResult>('/v3/launchpad/flags');
}

export function useLaunchpadSummary() {
  return useQuery({
    queryKey: ['launchpad', 'summary'],
    queryFn: fetchSummary,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
}

export function useLaunchpadFlags() {
  return useQuery({
    queryKey: ['launchpad', 'flags'],
    queryFn: fetchFlags,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
}
