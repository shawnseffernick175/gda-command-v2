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

export function useOodaAnalysis() {
  return useMutation({
    mutationFn: (params: {
      opportunity_id: string;
      stage?: string;
      context?: Record<string, unknown>;
    }) =>
      apiPost<LlmResponse>("/v3/agent/run", {
        task: "ooda_analysis",
        input: params,
      }),
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
      apiPost<LlmResponse>("/v3/agent/run", {
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
