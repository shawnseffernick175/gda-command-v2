import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api-client';
import type {
  AgentDecision,
  DecisionKind,
  EntityKind,
  DecisionOutcome,
  PwinScoreResult,
  PwinModelInfo,
} from '../types';

interface DecisionFilters {
  entity_kind?: EntityKind;
  entity_id?: string;
  kind?: DecisionKind;
  since?: string;
  limit?: number;
}

function buildQueryString(filters: DecisionFilters): string {
  const params = new URLSearchParams();
  if (filters.entity_kind) params.set('entity_kind', filters.entity_kind);
  if (filters.entity_id) params.set('entity_id', filters.entity_id);
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.since) params.set('since', filters.since);
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useDecisionsList(filters: DecisionFilters = {}) {
  return useQuery({
    queryKey: ['decisions', filters],
    queryFn: () =>
      apiFetch<AgentDecision[]>(`/v3/memory/decisions${buildQueryString(filters)}`),
    staleTime: 15_000,
  });
}

export function useRecentDecisions(days = 7, limit = 10) {
  return useQuery({
    queryKey: ['decisions', 'recent', days, limit],
    queryFn: () =>
      apiFetch<AgentDecision[]>(`/v3/memory/decisions/recent?days=${days}&limit=${limit}`),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useEntityDecisions(entityKind: EntityKind, entityId: string) {
  return useQuery({
    queryKey: ['decisions', entityKind, entityId],
    queryFn: () =>
      apiFetch<AgentDecision[]>(
        `/v3/memory/decisions?entity_kind=${entityKind}&entity_id=${entityId}`,
      ),
    enabled: !!entityId,
    staleTime: 15_000,
  });
}

interface CreateDecisionInput {
  kind: DecisionKind;
  entity_kind: EntityKind;
  entity_id: string;
  rationale: string;
  evidence_refs?: Array<{ source_url: string; source_type: string; grade?: string }>;
  doctrine_alignment_score?: number;
  exclusion_triggers?: Array<{ exclusion_id: string; override_rationale?: string }>;
  margin_check?: { passed: boolean; margin_pct: number; threshold: number };
  made_by: string;
  parent_decision_id?: string;
}

export function useCreateDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDecisionInput) =>
      apiFetch<{ decision_id: string }>('/v3/memory/decisions', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['decisions'] });
    },
  });
}

interface RecordOutcomeInput {
  decisionId: string;
  outcome: DecisionOutcome;
  outcome_value?: number;
  outcome_evidence_refs?: Array<{ source_url: string; source_type: string; grade?: string }>;
}

export function useRecordOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ decisionId, ...body }: RecordOutcomeInput) =>
      apiFetch<AgentDecision>(`/v3/memory/decisions/${decisionId}/outcome`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['decisions'] });
    },
  });
}

export function usePwinScore(opportunityId: string) {
  return useQuery({
    queryKey: ['pwin', 'score', opportunityId],
    queryFn: () =>
      apiFetch<PwinScoreResult>('/v3/pwin/score', {
        method: 'POST',
        body: JSON.stringify({ opportunity_id: opportunityId }),
      }),
    enabled: !!opportunityId,
    staleTime: 60_000,
    retry: false,
  });
}

export function usePwinModel() {
  return useQuery({
    queryKey: ['pwin', 'model'],
    queryFn: () => apiFetch<PwinModelInfo>('/v3/pwin/model'),
    staleTime: 300_000,
  });
}
