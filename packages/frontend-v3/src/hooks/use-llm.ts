"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import type { LlmResponse } from "@/lib/types";

interface LlmRequest {
  task: string;
  input: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export function useLlmRoute() {
  return useMutation({
    mutationFn: (req: LlmRequest) =>
      apiPost<LlmResponse>("/v3/agent/run", req),
  });
}

const OODA_TIMEOUT_MS = 30_000;

export function useOodaAnalysis(params: {
  opportunity_id: string;
  stage?: string;
  context?: Record<string, unknown>;
}) {
  return useQuery({
    queryKey: ["ooda-analysis", params.opportunity_id, params.stage],
    queryFn: () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OODA_TIMEOUT_MS);
      return apiPost<LlmResponse>(
        "/v3/agent/run",
        { task: "ooda_analysis", input: params },
        { signal: controller.signal },
      ).finally(() => clearTimeout(timer));
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export interface AgentSource {
  url: string;
  tool?: string;
}

export interface AskAiResponse {
  answer: string;
  /** Sources the agent actually retrieved (R1-verified citations). */
  sources?: AgentSource[];
  /** Citation URLs in the answer NOT backed by a retrieved source (R1 flag). */
  unverified_citations?: string[];
  trace_id: string;
}

export function useAskAi() {
  return useMutation({
    mutationFn: (params: {
      question: string;
      object_type: string;
      object_id: string;
      context?: Record<string, unknown>;
    }) =>
      apiPost<AskAiResponse>("/v3/agent/ask", {
        task: "ask_ai",
        input: params,
      }),
  });
}

interface AgentHealth {
  backend_v3: string;
  agent_v3: string;
  trace_id?: string;
}

/**
 * Reachability of the agent runtime so the UI can show an explicit
 * "unavailable" state instead of an indefinite spinner when the analysis
 * service is down. `/v3/agent/healthz` returns a success envelope with
 * `agent_v3: "ok" | "unreachable"` (HTTP 503 when unreachable, which the API
 * layer still parses); a thrown request is treated as unreachable.
 */
export function useAgentHealth() {
  return useQuery({
    queryKey: ["agent-health"],
    queryFn: async (): Promise<AgentHealth> => {
      try {
        return await apiGet<AgentHealth>("/v3/agent/healthz");
      } catch {
        return { backend_v3: "unknown", agent_v3: "unreachable" };
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useBlackHat() {
  return useMutation({
    mutationFn: (params: {
      opportunity_id: string;
      context?: Record<string, unknown>;
    }) =>
      apiPost<LlmResponse>("/v3/agent/run", {
        task: "black_hat",
        input: params,
      }),
  });
}
