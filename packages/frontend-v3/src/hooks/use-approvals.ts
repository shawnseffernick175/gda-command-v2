"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import type {
  MatchSuggestionsResponse,
  BulkDecisionItem,
} from "@/lib/types";

export function useMatchSuggestions(params: {
  confidence?: string;
  limit?: number;
  cursor?: string;
} = {}) {
  return useQuery({
    queryKey: ["match-suggestions", params],
    queryFn: () =>
      apiGet<MatchSuggestionsResponse>("/v3/match-suggestions", {
        confidence: params.confidence,
        limit: params.limit ?? 50,
        cursor: params.cursor,
      }),
  });
}

export function useDecideMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      linkId,
      action,
    }: {
      linkId: number;
      action: "confirm" | "reject";
    }) =>
      apiPost<Record<string, unknown>>("/v3/match-suggestions", {
        link_id: linkId,
        action,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match-suggestions"] });
    },
  });
}

export function useBulkDecide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      items,
      decidedBy,
    }: {
      items: BulkDecisionItem[];
      decidedBy: string;
    }) =>
      apiPost<Record<string, unknown>>("/v3/match-suggestions/bulk", {
        items,
        decided_by: decidedBy,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match-suggestions"] });
    },
  });
}

export function useRecordDecision() {
  return useMutation({
    mutationFn: (decision: {
      entity_kind: string;
      entity_id: string;
      kind: string;
      rationale: string;
      decided_by: string;
    }) => apiPost<{ decision_id: string }>("/v3/memory/decisions", decision),
  });
}
