"use client";

import { useEffect, useMemo } from "react";
import { useCompetitorAnalysis, useBlackHatAnalysis } from "@/hooks/use-competitors";
import type { Competitor, CompetitorAnalysis } from "@/lib/types";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";

const RECOMPETE_SORT_COLS: ColumnSortConfig[] = [
  { field: "title", type: "string" },
  { field: "agency", type: "string" },
  { field: "value", type: "number" },
  { field: "expiration_date", type: "date" },
];

interface CompetitorDetailPanelProps {
  competitor: Competitor;
  onClose: () => void;
}

function formatDollars(value: number | null): string {
  if (value === null || value === undefined) return "$0";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function classificationColor(c: CompetitorAnalysis["classification"]): string {
  switch (c) {
    case "THREAT": return "bg-red-100 text-red-800 border-red-200";
    case "PARTNER": return "bg-blue-100 text-blue-800 border-blue-200";
    case "MONITOR": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    default: return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

function actionColor(a: CompetitorAnalysis["recommended_action"]): string {
  switch (a) {
    case "Compete": return "bg-green-100 text-green-800 border-green-200";
    case "Partner": return "bg-blue-100 text-blue-800 border-blue-200";
    case "Monitor": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "Ignore": return "bg-gray-100 text-gray-800 border-gray-200";
    default: return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

export function SizeBadge({ analysis }: { analysis: CompetitorAnalysis | null }) {
  if (!analysis) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
        ?
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
      {analysis.size_classification}
    </span>
  );
}

function SkeletonLine({ width = "w-full" }: { width?: string }) {
  return <div className={`h-4 ${width} bg-gray-200 rounded animate-pulse`} />;
}

function SkeletonBlock() {
  return (
    <div className="space-y-3">
      <SkeletonLine width="w-3/4" />
      <SkeletonLine />
      <SkeletonLine width="w-5/6" />
      <SkeletonLine width="w-1/2" />
    </div>
  );
}

export default function CompetitorDetailPanel({ competitor, onClose }: CompetitorDetailPanelProps) {
  const analyzeMutation = useCompetitorAnalysis(competitor.name);
  const analysis: CompetitorAnalysis | null = analyzeMutation.data ?? competitor.competitor_analysis ?? null;
  const isLoading = analyzeMutation.isPending;
  const blackHat = useBlackHatAnalysis(competitor.name);
  const { sortBy, sortDir, handleSort } = useTableSort("recomp");

  const sortedRecompetes = useMemo(() => {
    const items = analysis?.recompete_contracts ?? [];
    if (sortBy && items.length > 0) {
      return sortData(items as unknown as Record<string, unknown>[], sortBy, sortDir, RECOMPETE_SORT_COLS) as unknown as typeof items;
    }
    return items;
  }, [analysis?.recompete_contracts, sortBy, sortDir]);

  useEffect(() => {
    if (!competitor.competitor_analysis) {
      analyzeMutation.mutate();
    }
    blackHat.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitor.name]);

  const uei = competitor.awardee_uei;
  const usaSpendingUrl = uei
    ? `https://www.usaspending.gov/recipient/${uei}/latest`
    : null;

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-white shadow-2xl border-l border-gray-200 z-50 overflow-y-auto">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
        aria-label="Close panel"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold text-gray-900">{competitor.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {analysis && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                {analysis.size_classification}
              </span>
            )}
            {isLoading && !analysis && <SkeletonLine width="w-24" />}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Obligated</span>
              <p className="font-semibold">{formatDollars(Number(competitor.total_obligated))}</p>
            </div>
            <div>
              <span className="text-gray-500">Wins</span>
              <p className="font-semibold">{competitor.win_count}</p>
            </div>
            <div>
              <span className="text-gray-500">Last Win</span>
              <p className="font-semibold">{competitor.last_win_date ? new Date(competitor.last_win_date).toLocaleDateString() : "N/A"}</p>
            </div>
          </div>
        </div>

        {/* NAICS Codes */}
        {(competitor.naics_codes?.length ?? 0) > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">NAICS Codes</h3>
            <div className="flex flex-wrap gap-1.5">
              {competitor.naics_codes.map((code) => (
                <span key={code} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 border border-gray-200 font-mono">
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Departments */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Departments</h3>
          <div className="flex flex-wrap gap-1.5">
            {(competitor.agencies?.length ?? 0) > 0 ? (
              competitor.agencies.map((agency) => (
                <span key={agency} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 border border-gray-200">
                  {agency}
                </span>
              ))
            ) : (
              <span className="text-sm text-gray-400">No agency data</span>
            )}
          </div>
        </div>

        {/* AI Analysis */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">AI Analysis</h3>
          {isLoading && !analysis ? (
            <SkeletonBlock />
          ) : analysis ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold border ${classificationColor(analysis.classification)}`}>
                  {analysis.classification}
                </span>
                <span className="text-sm text-gray-600">{analysis.classification_rationale}</span>
              </div>
              <p className="text-sm text-gray-800 leading-relaxed">{analysis.so_what}</p>
              {analysis.trend && (
                <div className="text-xs text-gray-500">
                  Trend: <span className="font-medium">{analysis.trend}</span>
                </div>
              )}
            </div>
          ) : analyzeMutation.isError ? (
            <p className="text-sm text-gray-400">
              {analyzeMutation.error instanceof Error ? analyzeMutation.error.message : "Analysis unavailable"}
            </p>
          ) : (
            <p className="text-sm text-gray-400">Analysis not available</p>
          )}
        </div>

        {/* Re-compete Opportunities */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Re-compete Opportunities</h3>
          {isLoading && !analysis ? (
            <SkeletonBlock />
          ) : analysis && (analysis.recompete_contracts?.length ?? 0) > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <SortableHeader label="Title" field="title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Agency" field="agency" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Value" field="value" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                    <SortableHeader label="Expires" field="expiration_date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {sortedRecompetes.map((rc, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1.5 pr-2 text-gray-800">{rc.title}</td>
                      <td className="py-1.5 pr-2 text-gray-600">{rc.agency}</td>
                      <td className="py-1.5 text-right text-gray-800">{formatDollars(rc.value)}</td>
                      <td className="py-1.5 text-right text-gray-600">{rc.expiration_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No re-compete opportunities identified in the next 18 months.</p>
          )}
        </div>

        {/* Recommended Action */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Recommended Action</h3>
          {isLoading && !analysis ? (
            <SkeletonLine width="w-32" />
          ) : analysis ? (
            <span className={`inline-flex items-center px-3 py-1.5 rounded text-sm font-bold border ${actionColor(analysis.recommended_action)}`}>
              {analysis.recommended_action}
            </span>
          ) : null}
        </div>

        {/* Black Hat Analysis */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Black Hat Analysis</h3>
          {blackHat.isPending ? (
            <SkeletonBlock />
          ) : blackHat.data ? (
            <div className="space-y-3">
              <div>
                <span className="text-xs uppercase tracking-wide text-gray-500">Likely Approach</span>
                <p className="text-sm text-gray-800 leading-relaxed">{blackHat.data.likely_approach}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-green-700">Strengths</span>
                  <ul className="mt-1 space-y-0.5">
                    {blackHat.data.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-gray-800">
                        <span className="mt-1.5 h-1 w-1 rounded-full bg-green-600 shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="text-xs text-red-700">Weaknesses</span>
                  <ul className="mt-1 space-y-0.5">
                    {blackHat.data.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-gray-800">
                        <span className="mt-1.5 h-1 w-1 rounded-full bg-red-500 shrink-0" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-gray-500">Counter Strategy</span>
                <p className="text-sm text-gray-800 leading-relaxed">{blackHat.data.counter_strategy}</p>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-gray-500">Intel Summary</span>
                <p className="text-sm text-gray-600 leading-relaxed">{blackHat.data.intel_summary}</p>
              </div>
              {blackHat.data.from_cache && (
                <span className="text-[11px] text-gray-400">Cached</span>
              )}
            </div>
          ) : blackHat.isError ? (
            <p className="text-sm text-gray-400">
              {blackHat.error instanceof Error ? blackHat.error.message : "Black hat analysis unavailable"}
            </p>
          ) : null}
        </div>

        {/* Source */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Source</h3>
          {usaSpendingUrl ? (
            <a
              href={usaSpendingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
            >
              USAspending
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          ) : (
            <span className="text-sm text-gray-400">UEI not available for direct link</span>
          )}
        </div>
      </div>
    </div>
  );
}
