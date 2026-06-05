"use client";

import { useState } from "react";
import { useFastTrackList, useRunFastTrack } from "@/hooks/use-fast-track";
import { Badge } from "@/components/ui/badge";
import { SourceChip } from "@/components/shared/source-chip";
import { CollapseSection } from "@/components/shared/collapse-section";
import { cn } from "@/lib/utils";
import type { FastTrackAssessment } from "@/lib/types";

const GRADE_STYLES: Record<string, string> = {
  A: "bg-gda-green/15 border-gda-green/40 text-gda-green",
  B: "bg-gda-cyan/15 border-gda-cyan/40 text-gda-cyan",
  C: "bg-amber-400/15 border-amber-400/40 text-amber-400",
  D: "bg-orange-500/15 border-orange-500/40 text-orange-400",
  F: "bg-red-500/15 border-red-500/40 text-red-400",
};

function gradeStyle(grade: string): string {
  return GRADE_STYLES[grade?.toUpperCase()] ?? "bg-gda-panel border-border text-muted-foreground";
}

const EMPTY_FORM = {
  title: "",
  description: "",
  naics_raw: "",        // comma-separated input
  set_aside: "",
  place_of_performance: "",
};

type TriageResult = FastTrackAssessment & {
  source_chips?: Array<{ label: string; url?: string; kind?: string }>;
};

export default function FastTrackPage() {
  const { data: listData, isLoading: listLoading } = useFastTrackList();
  const runTriage = useRunFastTrack();

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [result, setResult] = useState<TriageResult | null>(null);
  const [triaging, setTriaging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recent = listData?.items ?? [];

  async function handleTriage(e: React.FormEvent) {
    e.preventDefault();
    setTriaging(true);
    setError(null);
    setResult(null);

    const naics = form.naics_raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{6}$/.test(s));

    try {
      const res = await runTriage.mutateAsync({
        title: form.title.trim(),
        description: form.description.trim(),
        naics_codes: naics,
        set_aside: form.set_aside.trim() || null,
        place_of_performance: form.place_of_performance.trim() || null,
      });
      setResult(res as TriageResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Triage failed";
      setError(msg.includes("503") || msg.includes("ANALYSIS_TIMEOUT")
        ? "Analysis queued — result will appear in Recent Assessments within 30s."
        : msg);
    } finally {
      setTriaging(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-mono text-lg font-bold text-foreground">Fast Track</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Submit any opportunity for AI-powered go/no-go triage in seconds
        </p>
      </div>

      {/* Triage Form */}
      <form onSubmit={handleTriage} className="rounded border border-border bg-gda-panel p-4 space-y-3">
        <p className="font-mono text-xs font-semibold text-foreground">Triage Input</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Title */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] text-muted-foreground mb-1">Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Opportunity title"
              className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            />
          </div>
          {/* Description */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] text-muted-foreground mb-1">Description / SOW *</label>
            <textarea
              required
              rows={4}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Paste the full description or statement of work…"
              className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50 resize-none"
            />
          </div>
          {/* NAICS */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">NAICS Codes (comma-separated 6-digit)</label>
            <input
              value={form.naics_raw}
              onChange={(e) => setForm((f) => ({ ...f, naics_raw: e.target.value }))}
              placeholder="541330, 541512"
              className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50 font-mono"
            />
          </div>
          {/* Set-aside */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">Set-Aside</label>
            <input
              value={form.set_aside}
              onChange={(e) => setForm((f) => ({ ...f, set_aside: e.target.value }))}
              placeholder="e.g. SDVOSB, 8(a), HUBZone"
              className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            />
          </div>
          {/* PoP */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">Place of Performance</label>
            <input
              value={form.place_of_performance}
              onChange={(e) => setForm((f) => ({ ...f, place_of_performance: e.target.value }))}
              placeholder="e.g. Fort Eustis, VA"
              className="w-full rounded border border-border bg-gda-bg-base px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gda-green/50"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={triaging}
            className="rounded border border-gda-green bg-gda-green/10 px-4 py-1.5 text-xs font-mono font-medium text-gda-green hover:bg-gda-green/20 disabled:opacity-50 transition-colors"
          >
            {triaging ? "Triaging…" : "Run Fast Track"}
          </button>
          {triaging && (
            <span className="text-[11px] text-muted-foreground animate-pulse">
              AI analysis in progress — up to 10s
            </span>
          )}
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="rounded border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-400">
          {error}
        </div>
      )}

      {/* Result Card */}
      {result && (
        <div className={cn("rounded border p-4 space-y-3", gradeStyle(result.grade))}>
          <div className="flex items-center gap-3">
            <span className={cn("text-2xl font-mono font-bold rounded border px-2.5 py-1", gradeStyle(result.grade))}>
              {result.grade}
            </span>
            <div>
              <p className="text-xs font-semibold text-foreground">
                NAICS Match: {(result.naics_match_score * 100).toFixed(0)}%
              </p>
              <p className="text-[11px] text-muted-foreground">
                {result.cache_hit ? "Cached result" : "Fresh analysis"} · {result.model_used}
              </p>
            </div>
            <Badge variant="outline" className={cn("ml-auto text-[11px] font-mono", gradeStyle(result.grade))}>
              {result.grade} Grade
            </Badge>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Recommended Action</p>
            <p className="text-xs text-foreground">{result.recommended_action}</p>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Rationale</p>
            <p className="text-xs text-foreground whitespace-pre-wrap">{result.rationale}</p>
          </div>

          {result.source_chips && result.source_chips.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {result.source_chips.map((chip, i) => (
                <SourceChip
                  key={i}
                  label={chip.label}
                  url={chip.url}
                  kind={(chip.kind as "real" | "heuristic" | "pending") ?? "heuristic"}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Assessments */}
      <CollapseSection id="ft-recent" title="Recent Assessments" defaultOpen={true}>
        {listLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-gda-bg-base" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No assessments yet — run your first Fast Track above
          </p>
        ) : (
          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gda-bg-base text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Grade</th>
                  <th className="px-3 py-2 text-left font-medium">NAICS Match</th>
                  <th className="px-3 py-2 text-left font-medium">Recommended Action</th>
                  <th className="px-3 py-2 text-left font-medium">Model</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-border hover:bg-gda-panel/50 cursor-pointer"
                    onClick={() => setResult(a as TriageResult)}
                    title="Click to view full result"
                  >
                    <td className="px-3 py-2 text-left">
                      <span className={cn("rounded border px-2 py-0.5 text-xs font-mono font-bold", gradeStyle(a.grade))}>
                        {a.grade}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-left font-mono text-xs text-foreground">
                      {(a.naics_match_score * 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2 text-left text-xs text-muted-foreground max-w-[280px]">
                      <span className="truncate block" title={a.recommended_action}>
                        {a.recommended_action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-left text-[11px] text-muted-foreground font-mono">
                      {a.model_used}
                    </td>
                    <td className="px-3 py-2 text-left text-[11px] text-muted-foreground">
                      {new Date(a.generated_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapseSection>
    </div>
  );
}
