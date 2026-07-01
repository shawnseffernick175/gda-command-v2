import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";

export interface PrincipleScore {
  score: number;
  rationale: string;
  evidence_grade: "A" | "B" | "C";
  citations: string[];
}

export interface ExclusionResult {
  id: string;
  name: string;
  triggered: boolean;
  evidence: string[];
  override_available: boolean;
}

export interface MarginCheck {
  passed: boolean;
  margin_pct: number | null;
  threshold: number;
  source: string;
}

export interface DoctrineEvaluation {
  id: string;
  entity_kind: string;
  entity_id: string;
  agent_run_id: string | null;
  principle_scores: Record<string, PrincipleScore>;
  alignment_total: number;
  exclusion_triggers: ExclusionResult[];
  margin_check: MarginCheck;
  evidence_grades: Record<string, "A" | "B" | "C">;
  recommendations: string[];
  evaluated_at: string;
}

export function useDoctrineEvaluations(entityKind: string, entityId: string | null) {
  return useQuery({
    queryKey: ["doctrine", "evaluations", entityKind, entityId],
    queryFn: () =>
      apiGet<DoctrineEvaluation[]>("/v3/doctrine/evaluations", {
        entity_kind: entityKind,
        entity_id: entityId!,
      }),
    enabled: !!entityId,
  });
}

export function useDoctrineCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { entity_kind: string; entity_id: string; context?: Record<string, unknown> }) =>
      apiPost<DoctrineEvaluation>("/v3/doctrine/check", params),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: ["doctrine", "evaluations", variables.entity_kind, variables.entity_id],
      });
    },
  });
}

export function useDoctrineOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      entity_kind: string;
      entity_id: string;
      kind: string;
      rationale: string;
      exclusion_ids?: string[];
    }) => apiPost<{ id: string; decided_at: string }>("/v3/doctrine/override", params),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: ["doctrine", "evaluations", variables.entity_kind, variables.entity_id],
      });
    },
  });
}
