"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { sseFetch, ApiError } from "@/lib/api";

/**
 * F-305: SSE hook for progressive 10-section decision brief.
 * Connects to GET /v3/opportunities/:id/analysis and streams sections.
 */

export interface SourceRef {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

export interface PwinSectionData {
  score: number | null;
  grade: "Go" | "Reconsider" | "Pass" | null;
  top_drivers: string[];
}

export interface DoctrineSectionData {
  alignment_total: number | null;
  max_score: number;
  principle_scores: Record<string, { score: number; rationale: string; evidence_grade: string; citations: string[] }>;
  exclusions_triggered: Array<{ id: string; name: string; triggered: boolean; evidence: string[]; override_available: boolean }>;
  margin_check: { passed: boolean; margin_pct: number | null; threshold: number; source: string } | null;
  evidence_grades: Record<string, string>;
  recommendations: string[];
  error?: string;
}

export interface IncumbentSectionData {
  name: string | null;
  confidence: string | null;
  contract_number: string | null;
  contract_ceiling: string | null;
  end_date: string | null;
  performance_signals: string | null;
}

export interface SimilarAwardEntry {
  title: string;
  agency: string;
  value: string;
  awardee: string;
  date: string;
  score: number;
  url: string;
}

export interface SimilarAwardsSectionData {
  awards: SimilarAwardEntry[];
  query_used: string;
}

export interface CompetitorsSectionData {
  competitors: Array<{ name: string; threat_level: string; our_differentiator?: string }>;
}

export interface DecisionFactorsSectionData {
  evaluation_type: string;
  past_performance_weight: string;
  key_personnel_required: boolean;
  set_aside_type: string | null;
  small_business_play: boolean;
}

export interface TeamingSectionData {
  opportunities: Array<{ partner: string; rationale: string }>;
  has_teaming_fit: boolean;
}

export interface WinThemesSectionData {
  themes: string[];
  strategy: string | null;
}

export interface RiskEntry {
  level: string;
  description: string;
  mitigation?: string | null;
  regulatory_citation?: string | null;
}

export interface RisksSectionData {
  risks: RiskEntry[];
}

export interface CitationsSectionData {
  all_sources: SourceRef[];
  analysis_version: string;
  generated_at: string;
  cache_fresh: boolean;
}

export interface AnalysisSections {
  pwin: { data: PwinSectionData; sources: SourceRef[]; stale?: boolean } | null;
  doctrine: { data: DoctrineSectionData; sources: SourceRef[]; stale?: boolean } | null;
  incumbent: { data: IncumbentSectionData; sources: SourceRef[]; stale?: boolean } | null;
  similar_awards: { data: SimilarAwardsSectionData; sources: SourceRef[]; stale?: boolean } | null;
  competitors: { data: CompetitorsSectionData; sources: SourceRef[]; stale?: boolean } | null;
  decision_factors: { data: DecisionFactorsSectionData; sources: SourceRef[]; stale?: boolean } | null;
  teaming: { data: TeamingSectionData; sources: SourceRef[]; stale?: boolean } | null;
  win_themes: { data: WinThemesSectionData; sources: SourceRef[]; stale?: boolean } | null;
  risks: { data: RisksSectionData; sources: SourceRef[]; stale?: boolean } | null;
  citations: { data: CitationsSectionData; sources: SourceRef[]; stale?: boolean } | null;
}

type SectionName = keyof AnalysisSections;

export interface UseOpportunityAnalysisReturn {
  sections: AnalysisSections;
  isStreaming: boolean;
  isDone: boolean;
  error: string | null;
  traceId: string | null;
  retry: () => void;
}

const EMPTY_SECTIONS: AnalysisSections = {
  pwin: null,
  doctrine: null,
  incumbent: null,
  similar_awards: null,
  competitors: null,
  decision_factors: null,
  teaming: null,
  win_themes: null,
  risks: null,
  citations: null,
};

export function useOpportunityAnalysis(opportunityId: string | undefined): UseOpportunityAnalysisReturn {
  const [sections, setSections] = useState<AnalysisSections>(EMPTY_SECTIONS);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const retry = useCallback(() => {
    setSections(EMPTY_SECTIONS);
    setIsDone(false);
    setError(null);
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!opportunityId) return;

    const controller = new AbortController();
    abortRef.current = controller;

    // Use microtask to avoid synchronous setState in effect body
    queueMicrotask(() => {
      setIsStreaming(true);
      setIsDone(false);
      setError(null);
      setSections(EMPTY_SECTIONS);
    });

    async function streamAnalysis() {
      try {
        // Routes through the shared networking layer: attaches the Bearer token
        // and, on a 401, silently refreshes + retries once. A hard auth failure
        // redirects to /login rather than leaving the Opportunities view blank.
        const response = await sseFetch(
          `/v3/opportunities/${opportunityId}/analysis`,
          { signal: controller.signal },
        );

        const responseTraceId = response.headers.get("X-GDA-Trace-Id");
        if (responseTraceId) setTraceId(responseTraceId);

        if (!response.ok) {
          const text = await response.text();
          setError(`Analysis failed: ${response.status} ${text}`);
          setIsStreaming(false);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setError("No response body");
          setIsStreaming(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: done")) {
              setIsDone(true);
              setIsStreaming(false);
              return;
            }
            if (line.startsWith("data: ")) {
              try {
                const payload = JSON.parse(line.slice(6)) as {
                  section: string;
                  data: unknown;
                  sources: SourceRef[];
                  trace_id: string;
                  stale?: boolean;
                };

                if (payload.trace_id && !traceId) {
                  setTraceId(payload.trace_id);
                }

                const sectionName = payload.section as SectionName;
                if (sectionName in EMPTY_SECTIONS) {
                  setSections((prev) => ({
                    ...prev,
                    [sectionName]: {
                      data: payload.data,
                      sources: payload.sources,
                      stale: payload.stale,
                    },
                  }));
                }
              } catch {
                // Skip malformed JSON lines
              }
            }
          }
        }

        setIsStreaming(false);
        setIsDone(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        // A hard 401 (refresh failed) already redirected to /login — surface a
        // calm session message rather than a raw error, and never blank the view.
        if (err instanceof ApiError && err.status === 401) {
          setError("Session expired — redirecting to sign in");
          setIsStreaming(false);
          return;
        }
        setError((err as Error).message ?? "Analysis stream failed");
        setIsStreaming(false);
      }
    }

    void streamAnalysis();

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId, retryCount]);

  return { sections, isStreaming, isDone, error, traceId, retry };
}
