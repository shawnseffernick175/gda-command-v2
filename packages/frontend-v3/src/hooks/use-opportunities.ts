"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut, apiPost, apiPatch, ApiError } from "@/lib/api";
import type {
  OpportunitySummary,
  OpportunityDetail,
} from "@/lib/types";

interface OpportunitiesPaginated {
  items: OpportunitySummary[];
  pagination: { limit: number; cursor: string | null; hasMore: boolean };
}

export interface OpportunityMeta {
  total_count: number;
  due_this_week: number;
  unscored_count: number;
  total_value: number;
  hot_count: number;
  idiq_count: number;
  stage_counts: Record<string, number>;
}

interface OpportunitiesPagedResponse {
  items: OpportunitySummary[];
  total: number;
  page: number;
  totalPages: number;
  meta?: OpportunityMeta;
}

interface UseOpportunitiesParams {
  q?: string;
  limit?: number;
  cursor?: string;
  status?: string;
  agency?: string;
  department?: string;
  naics?: string;
  due_before?: string;
  due_after?: string;
}

export function useOpportunities(params: UseOpportunitiesParams = {}) {
  return useQuery({
    queryKey: ["opportunities", params],
    queryFn: () =>
      apiGet<OpportunitiesPaginated>("/v3/opportunities", {
        q: params.q,
        limit: params.limit ?? 100,
        cursor: params.cursor,
        status: params.status,
        agency: params.agency,
        department: params.department,
        naics: params.naics,
        due_before: params.due_before,
        due_after: params.due_after,
      }),
  });
}

export interface UseOpportunitiesPagedParams {
  q?: string;
  limit?: number;
  page?: number;
  status?: string;
  agency?: string;
  department?: string;
  naics?: string;
  hot?: string;
  due_before?: string;
  due_after?: string;
  due?: string;
  set_asides?: string[];
  value_min?: number;
  value_max?: number;
  sources?: string[];
  stage?: string;
  relevant_only?: boolean;
  idiq?: 'only' | 'exclude';
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

export function useOpportunitiesPaged(params: UseOpportunitiesPagedParams = {}) {
  return useQuery({
    queryKey: ["opportunities-paged", params],
    queryFn: () =>
      apiGet<OpportunitiesPagedResponse>("/v3/opportunities", {
        q: params.q,
        limit: params.limit ?? 100,
        page: params.page ?? 1,
        status: params.status,
        agency: params.agency,
        department: params.department,
        naics: params.naics,
        hot: params.hot,
        due_before: params.due_before,
        due_after: params.due_after,
        due: params.due,
        "set_aside[]": params.set_asides,
        value_min: params.value_min,
        value_max: params.value_max,
        "source[]": params.sources,
        stage: params.stage,
        relevant_only: params.relevant_only === false ? "false" : undefined,
        idiq: params.idiq,
        sort_by: params.sort_by,
        sort_dir: params.sort_dir,
      }),
    refetchInterval: (query) => {
      const items = query.state.data?.items;
      if (!items) return false;
      const hasAnalyzing = items.some((i) => !i.pwin);
      return hasAnalyzing ? 10_000 : false;
    },
  });
}

export function useOpportunitiesInfinite(params: Omit<UseOpportunitiesPagedParams, "page">) {
  return useInfiniteQuery({
    queryKey: ["opportunities-infinite", params],
    queryFn: ({ pageParam = 1 }) =>
      apiGet<OpportunitiesPagedResponse>("/v3/opportunities", {
        q: params.q,
        limit: params.limit ?? 50,
        page: pageParam as number,
        status: params.status,
        agency: params.agency,
        department: params.department,
        naics: params.naics,
        hot: params.hot,
        due_before: params.due_before,
        due_after: params.due_after,
        due: params.due,
        "set_aside[]": params.set_asides,
        value_min: params.value_min,
        value_max: params.value_max,
        "source[]": params.sources,
        stage: params.stage,
        relevant_only: params.relevant_only === false ? "false" : undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.totalPages) return lastPage.page + 1;
      return undefined;
    },
    refetchInterval: (query) => {
      const pages = query.state.data?.pages;
      if (!pages) return false;
      const hasAnalyzing = pages.some((p) => p.items.some((i) => !i.pwin));
      return hasAnalyzing ? 10_000 : false;
    },
  });
}

export function useOpportunity(id: string) {
  return useQuery({
    queryKey: ["opportunity", id],
    queryFn: () => apiGet<OpportunityDetail>(`/v3/opportunities/${id}`),
    enabled: !!id,
    // The detail endpoint blocks while analysis runs and returns 503
    // ANALYSIS_TIMEOUT if it isn't ready in time. Analysis lands seconds later,
    // so poll a handful of times instead of dead-ending on "Analysis not ready".
    retry: (failureCount, error) => {
      const isAnalysisTimeout =
        error instanceof ApiError &&
        (error.code === "ANALYSIS_TIMEOUT" || error.status === 503);
      if (isAnalysisTimeout) return failureCount < 5;
      return failureCount < 1;
    },
    retryDelay: (failureCount, error) => {
      const isAnalysisTimeout =
        error instanceof ApiError &&
        (error.code === "ANALYSIS_TIMEOUT" || error.status === 503);
      // Fixed short backoff while analysis completes; default for other errors.
      return isAnalysisTimeout ? 3_000 : Math.min(1_000 * 2 ** failureCount, 5_000);
    },
  });
}

export function useFieldOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      internalId,
      fieldName,
      fieldValue,
      reason,
    }: {
      internalId: string;
      fieldName: string;
      fieldValue: unknown;
      reason?: string;
    }) =>
      apiPut<Record<string, unknown>>(
        `/v3/opportunities/${internalId}/field-override`,
        { field_name: fieldName, field_value: fieldValue, reason },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["opportunities"] });
      void qc.invalidateQueries({ queryKey: ["opportunities-paged"] });
      void qc.invalidateQueries({ queryKey: ["opportunities-infinite"] });
      void qc.invalidateQueries({ queryKey: ["opportunity"] });
    },
  });
}

interface AnalyzeResponse {
  queued?: boolean;
  opportunity_id?: string;
  message?: string;
}

export interface AnalysisStatusResponse {
  state: "idle" | "analyzing" | "done" | "error";
  has_llm_analysis: boolean;
  llm_error_kind: string | null;
  analyzed_at: string | null;
}

export function useAnalyzeOpportunity() {
  const qc = useQueryClient();
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisStatusResponse["state"]>("idle");
  const [llmError, setLlmError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPollingId(null);
  }, []);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    setPollingId(id);
    setAnalysisState("analyzing");
    setLlmError(null);
    startRef.current = Date.now();

    intervalRef.current = setInterval(async () => {
      const elapsed = Date.now() - startRef.current;
      if (elapsed > 120_000) {
        setAnalysisState("idle");
        stopPolling();
        return;
      }
      try {
        const res = await apiGet<AnalysisStatusResponse>(
          `/v3/opportunities/${id}/analysis-status`,
        );
        if (res.state === "done") {
          setAnalysisState("done");
          stopPolling();
          void qc.invalidateQueries({ queryKey: ["opportunity", id] });
        } else if (res.state === "error") {
          setAnalysisState("error");
          setLlmError(res.llm_error_kind);
          stopPolling();
          void qc.invalidateQueries({ queryKey: ["opportunity", id] });
        }
        // stay in analyzing while state is 'analyzing'
      } catch {
        // network error -- keep polling
      }
    }, 3_000);
  }, [stopPolling, qc]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const mutation = useMutation({
    mutationFn: (id: string) =>
      apiPost<OpportunityDetail | AnalyzeResponse>(`/v3/opportunities/${id}/analyze`),
    onSuccess: (data, id) => {
      if (data && "queued" in data && data.queued) {
        startPolling(id);
      } else {
        // Got immediate result
        void qc.invalidateQueries({ queryKey: ["opportunity", id] });
      }
    },
  });

  return {
    ...mutation,
    analysisState,
    pollingId,
    llmError,
    startPolling,
    stopPolling,
  };
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      apiPatch<Record<string, unknown>>(`/v3/opportunities/${id}`, { stage }),

    onMutate: async (vars) => {
      // Optimistic update: immediately reflect the new stage in caches
      await qc.cancelQueries({ queryKey: ["opportunity", vars.id] });
      await qc.cancelQueries({ queryKey: ["opportunities-paged"] });

      const prevDetail = qc.getQueryData<OpportunityDetail>(["opportunity", vars.id]);
      const prevPaged = qc.getQueriesData<OpportunitiesPagedResponse>({
        queryKey: ["opportunities-paged"],
      });

      // Update detail cache
      if (prevDetail) {
        qc.setQueryData<OpportunityDetail>(["opportunity", vars.id], {
          ...prevDetail,
          pipeline_stage: vars.stage,
        });
      }

      // Update list cache
      for (const [key, data] of prevPaged) {
        if (!data) continue;
        qc.setQueryData<OpportunitiesPagedResponse>(key, {
          ...data,
          items: data.items.map((item) =>
            String(item.id) === vars.id ? { ...item, pipeline_stage: vars.stage } : item,
          ),
        });
      }

      return { prevDetail, prevPaged };
    },

    onError: (_err, vars, ctx) => {
      // Rollback on error
      if (ctx?.prevDetail) {
        qc.setQueryData(["opportunity", vars.id], ctx.prevDetail);
      }
      if (ctx?.prevPaged) {
        for (const [key, data] of ctx.prevPaged) {
          qc.setQueryData(key, data);
        }
      }
    },

    onSettled: (_data, _err, vars) => {
      void qc.invalidateQueries({ queryKey: ["opportunity", vars.id] });
      void qc.invalidateQueries({ queryKey: ["opportunities-paged"] });
    },
  });
}
