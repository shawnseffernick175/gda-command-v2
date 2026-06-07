"use client";

import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
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

export function useOodaAnalysis() {
  return useMutation({
    mutationFn: (params: {
      opportunity_id: string;
      stage?: string;
      context?: Record<string, unknown>;
    }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OODA_TIMEOUT_MS);
      return apiPost<LlmResponse>(
        "/v3/agent/run",
        { task: "ooda_analysis", input: params },
        { signal: controller.signal },
      ).finally(() => clearTimeout(timer));
    },
  });
}

export function useAskAi() {
  return useMutation({
    mutationFn: (params: {
      question: string;
      object_type: string;
      object_id: string;
      context?: Record<string, unknown>;
    }) =>
      apiPost<{ answer: string; trace_id: string }>("/v3/agent/ask", {
        task: "ask_ai",
        input: params,
      }),
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
