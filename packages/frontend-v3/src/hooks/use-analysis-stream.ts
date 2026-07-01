"use client";
/**
 * F-305: SSE hook for progressive opportunity analysis streaming.
 * Opens an EventSource to /v3/opportunities/:id/analysis and collects
 * sections as they arrive, updating a React state map for progressive UI.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { getToken } from "@/lib/api";
import type {
  AnalysisSectionBase,
  AnalysisSectionId,
  AnalysisBriefComplete,
} from "@/lib/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "https://gda-v3.csr-llc.tech";

const SECTION_ORDER: AnalysisSectionId[] = [
  "pwin",
  "doctrine",
  "incumbent",
  "similar_awards",
  "competitors",
  "decision_factors",
  "teaming",
  "win_themes",
  "risks",
  "citations",
];

const SECTION_LABELS: Record<AnalysisSectionId, string> = {
  pwin: "PWin Score",
  doctrine: "Doctrine Alignment",
  incumbent: "Incumbent",
  similar_awards: "Similar Awards",
  competitors: "Competitors",
  decision_factors: "Decision Factors",
  teaming: "Teaming Opportunities",
  win_themes: "Doctrine-Aligned Win Themes",
  risks: "Risks",
  citations: "Citations",
};

export type AnalysisSectionMap = Partial<
  Record<AnalysisSectionId, AnalysisSectionBase & { data: unknown }>
>;

export interface AnalysisStreamState {
  sections: AnalysisSectionMap;
  status: "idle" | "connecting" | "streaming" | "done" | "error";
  error: string | null;
  cached: boolean;
  sectionOrder: AnalysisSectionId[];
  sectionLabels: Record<AnalysisSectionId, string>;
}

export function useAnalysisStream(
  opportunityId: string | null,
): AnalysisStreamState {
  const [sections, setSections] = useState<AnalysisSectionMap>({});
  const [status, setStatus] = useState<AnalysisStreamState["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const ranRef = useRef<string | null>(null);

  const connect = useCallback(async (id: string) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Initialize all sections as pending
    const initial: AnalysisSectionMap = {};
    for (const sid of SECTION_ORDER) {
      initial[sid] = {
        section_id: sid,
        section_label: SECTION_LABELS[sid],
        status: "pending",
        trace_id: null,
        cached: false,
        source_changed: false,
        generated_at: null,
        data: null,
      };
    }
    setSections(initial);
    setStatus("connecting");
    setError(null);
    setCached(false);

    try {
      const token = getToken();
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(
        `${API_BASE}/v3/opportunities/${id}/analysis`,
        { headers, signal: controller.signal },
      );

      if (!res.ok) {
        setStatus("error");
        setError(`Analysis request failed (${res.status})`);
        return;
      }

      setStatus("streaming");
      const reader = res.body?.getReader();
      if (!reader) {
        setStatus("error");
        setError("No response stream available");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr) as Record<string, unknown>;
              if (currentEvent === "section") {
                const section = data as unknown as AnalysisSectionBase & {
                  data: unknown;
                };
                const sid = section.section_id as AnalysisSectionId;
                setSections((prev) => ({ ...prev, [sid]: section }));
              } else if (currentEvent === "complete") {
                const complete = data as unknown as AnalysisBriefComplete;
                setCached(complete.cached);
                setStatus("done");
              } else if (currentEvent === "error") {
                setStatus("error");
                setError(
                  (data.message as string) ?? "Analysis pipeline failed",
                );
              }
            } catch {
              // malformed JSON — skip
            }
            currentEvent = "";
          }
        }
      }

      setStatus((prev) => prev === "error" ? prev : "done");
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus("error");
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  }, []);

  useEffect(() => {
    if (!opportunityId) return;
    // Avoid re-triggering for the same ID
    if (ranRef.current === opportunityId) return;
    ranRef.current = opportunityId;
    void connect(opportunityId);

    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [opportunityId, connect]);

  return {
    sections,
    status,
    error,
    cached,
    sectionOrder: SECTION_ORDER,
    sectionLabels: SECTION_LABELS,
  };
}
