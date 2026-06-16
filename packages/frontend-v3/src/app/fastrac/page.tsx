"use client";

import { Suspense, useState, useCallback, useMemo } from "react";
import { useFasTracList, useRunFasTrac } from "@/hooks/use-fastrac";
import {
  useFTSignals,
} from "@/hooks/use-fastrac-signals";
import type { FTSignal, FasTracTab } from "@/hooks/use-fastrac-signals";
import {
  useFastracMatches,
  useFastracNeedFeed,
  useFastracSolutionFeed,
  useMatchFromNeed,
  useMatchFromSolution,
  usePromoteMatch,
} from "@/hooks/use-fastrac-bidirectional";
import type { ScoredCandidate } from "@/hooks/use-fastrac-bidirectional";
import { Badge } from "@/components/ui/badge";
import { SourceChip } from "@/components/shared/source-chip";
import { CollapseSection } from "@/components/shared/collapse-section";
import { ScoreExplain } from "@/components/shared/score-explainers";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { ViewToggle } from "@/components/fastrac/ViewToggle";
import type { FastracView } from "@/components/fastrac/ViewToggle";
import { MatchCardV2 } from "@/components/fastrac/MatchCardV2";
import { SignalFeedCard } from "@/components/fastrac/SignalFeedCard";
import { CandidatePanel } from "@/components/fastrac/CandidatePanel";
import { cn } from "@/lib/utils";
import type { FastTrackAssessment } from "@/lib/types";

const SIGNAL_SORT_COLS: ColumnSortConfig[] = [
  { field: "source", type: "string" },
  { field: "title", type: "string" },
  { field: "institution", type: "string", accessor: (r) => r.institution_name },
  { field: "horizon", type: "string" },
  { field: "strength", type: "number", accessor: (r) => r.signal_strength },
  { field: "urgency", type: "enum", enumOrder: ["critical", "high", "medium", "low"], accessor: (r) => r.urgency },
];

// ────────────────────────────────────────────────────────────
// Grade styling (triage form)
// ────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────
// Signal strength dot array (1–5 filled)
// ────────────────────────────────────────────────────────────
function SignalStrength({ value, source }: { value: number; source?: string }) {
  return (
    <div className="flex items-center gap-1" title={`Signal strength: ${value}/5`}>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "inline-block h-2 w-2 rounded-full border",
              i < value
                ? "bg-gda-green border-gda-green"
                : "bg-transparent border-border"
            )}
          />
        ))}
      </div>
      <ScoreExplain
        score={`${value}/5`}
        label="Signal Strength"
        scoreType="signal_strength"
        inputs={{ source }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Urgency badge
// ────────────────────────────────────────────────────────────
const URGENCY_STYLES: Record<string, string> = {
  critical: "bg-red-500/15 border-red-500/40 text-red-400",
  high:     "bg-orange-500/15 border-orange-500/40 text-orange-400",
  medium:   "bg-amber-400/15 border-amber-400/40 text-amber-400",
  low:      "bg-muted/30 border-border text-muted-foreground",
};

function UrgencyBadge({ urgency, horizon }: { urgency: string | null; horizon?: string }) {
  if (!urgency) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-mono uppercase", URGENCY_STYLES[urgency] ?? URGENCY_STYLES.low)}>
        {urgency}
      </span>
      <ScoreExplain
        score={urgency}
        label="Urgency"
        scoreType="urgency"
        inputs={{ horizon }}
      />
    </span>
  );
}



// ────────────────────────────────────────────────────────────
// Institution type badge
// ────────────────────────────────────────────────────────────
const INSTITUTION_STYLES: Record<string, string> = {
  academia:            "bg-gda-cyan/15 border-gda-cyan/40 text-gda-cyan",
  ffrdc:               "bg-amber-400/15 border-amber-400/40 text-amber-400",
  innovation_factory:  "bg-gda-green/15 border-gda-green/40 text-gda-green",
  startup:             "bg-purple-400/15 border-purple-400/40 text-purple-400",
  npo:                 "bg-muted/30 border-border text-muted-foreground",
};

const INSTITUTION_LABELS: Record<string, string> = {
  academia:            "Academia",
  ffrdc:               "FFRDC",
  innovation_factory:  "Innovation Factory",
  startup:             "Startup",
  npo:                 "NPO",
};

function InstitutionBadge({ type }: { type: string }) {
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-mono uppercase", INSTITUTION_STYLES[type] ?? INSTITUTION_STYLES.npo)}>
      {INSTITUTION_LABELS[type] ?? type}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// Tag pill
// ────────────────────────────────────────────────────────────
function Tag({ label }: { label: string }) {
  return (
    <span className="rounded border border-border bg-gda-bg-base px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
      {label}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// Signal card row (shared for both pipelines)
// ────────────────────────────────────────────────────────────
function SignalRow({ s, showInstitution }: { s: FTSignal; showInstitution?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const titleEl = s.source_url ? (
    <a
      href={s.doi ? `https://doi.org/${s.doi}` : s.source_url}
      target="_blank"
      rel="noreferrer"
      className="text-xs text-gda-cyan hover:underline leading-snug line-clamp-2"
      onClick={(e) => e.stopPropagation()}
    >
      {s.title}
    </a>
  ) : (
    <p className="text-xs text-foreground leading-snug line-clamp-2">{s.title}</p>
  );

  return (
    <>
      <tr
        className="border-b border-border hover:bg-gda-panel/50 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Source */}
        <td className="px-3 py-2 text-left align-top">
          <span className="text-[11px] font-mono text-gda-cyan whitespace-nowrap">{s.source}</span>
        </td>
        {/* Title */}
        <td className="px-3 py-2 text-left align-top max-w-[260px]">
          {titleEl}
          {s.mission_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {s.mission_tags.map((t) => <Tag key={t} label={t} />)}
            </div>
          )}
        </td>
        {/* Institution (industry only) */}
        {showInstitution && (
          <td className="px-3 py-2 text-left align-top">
            <div className="flex flex-col gap-1">
              {s.institution_name && (
                <span className="text-[11px] text-foreground">{s.institution_name}</span>
              )}
              {s.institution_type && <InstitutionBadge type={s.institution_type} />}
            </div>
          </td>
        )}
        {/* Horizon */}
        <td className="px-3 py-2 text-left align-top whitespace-nowrap">
          <span className="text-xs text-foreground font-mono">{s.horizon}</span>
        </td>
        {/* Signal strength */}
        <td className="px-3 py-2 text-left align-top">
          <SignalStrength value={s.signal_strength} source={s.source} />
        </td>
        {/* Urgency */}
        <td className="px-3 py-2 text-left align-top">
          <UrgencyBadge urgency={s.urgency} horizon={s.horizon} />
        </td>
        {/* Next action */}
        <td className="px-3 py-2 text-left align-top max-w-[240px]">
          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
            {s.next_review_action ?? "—"}
          </p>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-gda-bg-base/50">
          <td colSpan={showInstitution ? 7 : 6} className="px-3 py-3">
            <div className="space-y-2">
              {s.summary && (
                <p className="text-xs text-foreground leading-relaxed">{s.summary}</p>
              )}
              <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                {s.maturity && (
                  <span><span className="text-foreground/60">Maturity:</span> {s.maturity}</span>
                )}
                {s.transition_tags.length > 0 && (
                  <span>
                    <span className="text-foreground/60">Vehicles:</span>{" "}
                    {s.transition_tags.join(", ")}
                  </span>
                )}
                {s.problem_tags.length > 0 && (
                  <span>
                    <span className="text-foreground/60">Problems:</span>{" "}
                    {s.problem_tags.join(", ")}
                  </span>
                )}
                {s.published_at && (
                  <span>
                    <span className="text-foreground/60">Published:</span>{" "}
                    {new Date(s.published_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              {s.source_url && (
                <a
                  href={s.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-gda-cyan hover:underline font-mono"
                  onClick={(e) => e.stopPropagation()}
                >
                  View Source ↗
                </a>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Signal table wrapper
// ────────────────────────────────────────────────────────────
function SignalTable({ signals, loading, showInstitution, sortPrefix }: { signals: FTSignal[]; loading: boolean; showInstitution?: boolean; sortPrefix?: string }) {
  const { sortBy, sortDir, handleSort } = useTableSort(sortPrefix);

  const sorted = useMemo(() => {
    if (!sortBy) return signals;
    return sortData(signals as unknown as Record<string, unknown>[], sortBy, sortDir, SIGNAL_SORT_COLS) as unknown as FTSignal[];
  }, [signals, sortBy, sortDir]);
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-gda-bg-base" />
        ))}
      </div>
    );
  }
  if (signals.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        No signals ingested yet — ingest workers will populate this view
      </p>
    );
  }
  return (
    <div className="rounded border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-gda-bg-base text-[11px] text-muted-foreground">
            <SortableHeader label="Source" field="source" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="whitespace-nowrap" />
            <SortableHeader label="Title / Mission Tags" field="title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            {showInstitution && (
              <SortableHeader label="Institution" field="institution" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="whitespace-nowrap" />
            )}
            <SortableHeader label="Horizon" field="horizon" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="whitespace-nowrap" />
            <SortableHeader label="Strength" field="strength" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="whitespace-nowrap" />
            <SortableHeader label="Urgency" field="urgency" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="whitespace-nowrap" />
            <th className="px-3 py-2 text-left font-medium bg-gda-bg-base">Next Review Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <SignalRow key={s.id} s={s} showInstitution={showInstitution} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
// ────────────────────────────────────────────────────────────
// Pipeline tab switcher (Government / Industry / Academia)
// ────────────────────────────────────────────────────────────
function TabSwitcher({ activeTab, onChange }: { activeTab: FasTracTab; onChange: (t: FasTracTab) => void }) {
  const tabs: { key: FasTracTab; label: string; activeClass: string }[] = [
    { key: "government", label: "Government", activeClass: "bg-gda-green/15 border-gda-green/40 text-gda-green" },
    { key: "industry", label: "Industry", activeClass: "bg-gda-cyan/15 border-gda-cyan/40 text-gda-cyan" },
    { key: "academia", label: "Academia", activeClass: "bg-amber-400/15 border-amber-400/40 text-amber-400" },
  ];

  return (
    <div className="flex gap-1 mb-3">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "rounded px-3 py-1 text-xs font-mono font-medium transition-colors border",
            activeTab === t.key
              ? t.activeClass
              : "bg-gda-bg-base border-border text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Triage result helpers (unchanged)
// ────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  title: "",
  description: "",
  naics_raw: "",
  set_aside: "",
  place_of_performance: "",
};

type TriageResult = FastTrackAssessment & {
  source_chips?: Array<{ label: string; url?: string; kind?: string }>;
};

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────
export default function FasTracPage() {
  return (
    <Suspense fallback={<div />}>
      <FasTracContent />
    </Suspense>
  );
}

function FasTracContent() {
  const [activeView, setActiveView] = useState<FastracView>("match-engine");
  const [activeTab, setActiveTab] = useState<FasTracTab>("government");
  const { data: listData,    isLoading: listLoading    } = useFasTracList();
  const runTriage = useRunFasTrac();

  const [form, setForm]       = useState({ ...EMPTY_FORM });
  const [result, setResult]   = useState<TriageResult | null>(null);
  const [triaging, setTriaging] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const recent      = listData?.items ?? [];

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
      setError(
        msg.includes("503") || msg.includes("ANALYSIS_TIMEOUT")
          ? "Analysis queued — result will appear in Recent Assessments within 30s."
          : msg
      );
    } finally {
      setTriaging(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Sticky Page Header ──────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 pt-6 space-y-6 sticky-page-header">
        <div>
          <h1 className="font-mono text-lg font-bold text-foreground">FasTrac</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Need Sensing — monitor emerging technology & requirement signals, match them, and surface the right pursuit vehicle
          </p>
        </div>

        {/* ── Pipeline Tabs + View Toggle ────────────────────── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabSwitcher activeTab={activeTab} onChange={setActiveTab} />
          <ViewToggle active={activeView} onChange={setActiveView} />
        </div>
      </div>

      {/* ── View Content ──────────────────────────────────────── */}
      {activeView === "match-engine" && (
        <MatchEngineView activeTab={activeTab} />
      )}
      {activeView === "need-feed" && <NeedFeedView />}
      {activeView === "solution-feed" && <SolutionFeedView />}

      {/* ── TRIAGE FORM ───────────────────────────────────────── */}
      <CollapseSection
        id="ft-triage"
        title="Opportunity Triage"
        defaultOpen={false}
      >
        <div className="mb-3">
          <p className="text-[11px] text-muted-foreground">
            Paste any opportunity text for an instant AI go/no-go grade against Envision{"'"}s doctrine and NAICS profile.
          </p>
        </div>
        <form onSubmit={handleTriage} className="space-y-3">
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
              <label className="block text-[11px] text-muted-foreground mb-1">NAICS Codes (comma-separated)</label>
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
              {triaging ? "Triaging…" : "Run FasTrac"}
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
          <div className="mt-3 rounded border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-400">
            {error}
          </div>
        )}

        {/* Result Card */}
        {result && (
          <div className={cn("mt-3 rounded border p-4 space-y-3", gradeStyle(result.grade))}>
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
      </CollapseSection>

      {/* ── RECENT ASSESSMENTS ────────────────────────────────── */}
      <CollapseSection id="ft-recent" title={`Recent Assessments (${recent.length})`} defaultOpen={false}>
        {listLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-gda-bg-base" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No assessments yet — run your first triage above
          </p>
        ) : (
          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gda-bg-base text-[11px] text-muted-foreground">
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

// ────────────────────────────────────────────────────────────
// Match Engine View — all matches with evidence
// ────────────────────────────────────────────────────────────
function MatchEngineView({ activeTab }: { activeTab: FasTracTab }) {
  const { data: signalsData, isLoading: signalsLoading } = useFTSignals(activeTab);
  const { data: matchesV2, isLoading: matchesV2Loading } = useFastracMatches();
  const matches = matchesV2?.matches ?? [];
  const techSignals = signalsData?.tech ?? [];
  const reqSignals = signalsData?.requirement ?? [];
  const showInstitution = activeTab === "industry" || activeTab === "academia";

  return (
    <div className="space-y-6">
      {/* ── NEED SENSING: Technology Pipeline ────────────────── */}
      <CollapseSection
        id="ft-tech-pipeline"
        title={`Emerging Technology Pipeline (${techSignals.length})`}
        defaultOpen={true}
      >
        <div className="mb-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {activeTab === "academia"
              ? "Academic papers, FFRDC research outputs, innovation factory results, and university research that align with Envision's mission areas."
              : activeTab === "industry"
              ? "Startup dual-use capabilities, corporate R&D announcements, and commercial tech that align with Envision's mission areas."
              : "Watches DARPA, DIU, AFWERX, NavalX Tech Bridges, Army Applications Lab, NSIN, SBIR/STTR, startups and niche commercial firms for maturing dual-use capabilities that align with Envision's mission areas."}
          </p>
        </div>
        <SignalTable signals={techSignals} loading={signalsLoading} showInstitution={showInstitution} sortPrefix="tech" />
      </CollapseSection>

      {/* ── NEED SENSING: Requirements Pipeline ──────────────── */}
      <CollapseSection
        id="ft-req-pipeline"
        title={`Emerging Requirements Pipeline (${reqSignals.length})`}
        defaultOpen={true}
      >
        <div className="mb-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {activeTab === "academia"
              ? "FFRDC reports, university research outputs, and innovation factory assessments that surface emerging requirement patterns before formal procurements."
              : activeTab === "industry"
              ? "Corporate requirements, startup capability needs, and commercial dual-use demand signals."
              : "Tracks procurement forecasts, sources sought, RFIs, industry days, draft RFPs, CSOs, and post-RFI formal opportunities to surface demand signals before they become competed awards."}
          </p>
        </div>
        <SignalTable signals={reqSignals} loading={signalsLoading} showInstitution={showInstitution} sortPrefix="req" />
      </CollapseSection>

      {/* ── Need × Solution Matches ───────────────────────────── */}
      <CollapseSection
        id="ft-matches-v2"
        title={`Need × Solution Matches (${matches.length})`}
        defaultOpen={true}
      >
        <div className="mb-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Signals are normalized on mission, problem, maturity, urgency, and transition tags, then scored on mission fit, technical fit, and timing. Each match recommends a pursuit vehicle — direct contract, partner vehicle, subcontract, SBIR/STTR, CSO, or OT Agreement.
          </p>
        </div>
        {matchesV2Loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded bg-gda-bg-base" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No matches computed yet — match engine runs after signals are ingested
          </p>
        ) : (
          <div className="space-y-3">
            {matches.map((m) => (
              <MatchCardV2 key={m.id} m={m} />
            ))}
          </div>
        )}
      </CollapseSection>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Need Feed View — unmatched needs sorted by urgency
// ────────────────────────────────────────────────────────────
function NeedFeedView() {
  const { data, isLoading } = useFastracNeedFeed();
  const matchFromNeed = useMatchFromNeed();
  const promoteMatch = usePromoteMatch();
  const needs = data?.needs ?? [];

  const [candidateAnchor, setCandidateAnchor] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ScoredCandidate[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [promoteLoadingId, setPromoteLoadingId] = useState<string | null>(null);

  const handleFindSolutions = useCallback(async (signalId: string) => {
    setCandidateAnchor(signalId);
    setPanelLoading(true);
    try {
      const res = await matchFromNeed.mutateAsync(signalId);
      setCandidates(res.candidates);
    } catch {
      setCandidates([]);
    } finally {
      setPanelLoading(false);
    }
  }, [matchFromNeed]);

  const handlePromote = useCallback(async (needId: string, solutionId: string) => {
    setPromoteLoadingId(solutionId);
    try {
      await promoteMatch.mutateAsync({
        need_signal_id: needId,
        solution_signal_id: solutionId,
      });
    } finally {
      setPromoteLoadingId(null);
    }
  }, [promoteMatch]);

  const anchorNeed = needs.find((n) => n.id === candidateAnchor);

  return (
    <div className="space-y-6">
      <CollapseSection
        id="ft-need-feed"
        title={`Unmatched Needs (${needs.length})`}
        defaultOpen={true}
      >
        <div className="mb-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Need signals without strong solution matches, sorted by urgency. Click {'"'}Find solutions{'"'} to see the top 5 ranked solution candidates from the entire solution corpus.
          </p>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded bg-gda-bg-base" />
            ))}
          </div>
        ) : needs.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            All need signals have strong matches — nothing in the unmatched queue
          </p>
        ) : (
          <div className="space-y-3">
            {needs.map((n) => (
              <SignalFeedCard
                key={n.id}
                signal={n}
                actionLabel="Find solutions"
                onAction={() => handleFindSolutions(n.id)}
              />
            ))}
          </div>
        )}
      </CollapseSection>

      {candidateAnchor && (
        <CandidatePanel
          anchorTitle={anchorNeed?.title ?? "Need signal"}
          anchorIsNeed={true}
          candidates={candidates}
          loading={panelLoading}
          onClose={() => setCandidateAnchor(null)}
          onPromote={handlePromote}
          promoteLoadingId={promoteLoadingId}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Solution Feed View — unmatched solutions sorted by strength
// ────────────────────────────────────────────────────────────
function SolutionFeedView() {
  const { data, isLoading } = useFastracSolutionFeed();
  const matchFromSolution = useMatchFromSolution();
  const promoteMatch = usePromoteMatch();
  const solutions = data?.solutions ?? [];

  const [candidateAnchor, setCandidateAnchor] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ScoredCandidate[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [promoteLoadingId, setPromoteLoadingId] = useState<string | null>(null);

  const handleFindNeeds = useCallback(async (signalId: string) => {
    setCandidateAnchor(signalId);
    setPanelLoading(true);
    try {
      const res = await matchFromSolution.mutateAsync(signalId);
      setCandidates(res.candidates);
    } catch {
      setCandidates([]);
    } finally {
      setPanelLoading(false);
    }
  }, [matchFromSolution]);

  const handlePromote = useCallback(async (needId: string, solutionId: string) => {
    setPromoteLoadingId(needId);
    try {
      await promoteMatch.mutateAsync({
        need_signal_id: needId,
        solution_signal_id: solutionId,
      });
    } finally {
      setPromoteLoadingId(null);
    }
  }, [promoteMatch]);

  const anchorSolution = solutions.find((s) => s.id === candidateAnchor);

  return (
    <div className="space-y-6">
      <CollapseSection
        id="ft-solution-feed"
        title={`Unmatched Solutions (${solutions.length})`}
        defaultOpen={true}
      >
        <div className="mb-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Solution signals without strong need matches, sorted by signal strength. Click {'"'}Find needs{'"'} to see the top 5 ranked need candidates.
          </p>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded bg-gda-bg-base" />
            ))}
          </div>
        ) : solutions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            All solution signals have strong matches — nothing in the unmatched queue
          </p>
        ) : (
          <div className="space-y-3">
            {solutions.map((s) => (
              <SignalFeedCard
                key={s.id}
                signal={s}
                actionLabel="Find needs"
                onAction={() => handleFindNeeds(s.id)}
              />
            ))}
          </div>
        )}
      </CollapseSection>

      {candidateAnchor && (
        <CandidatePanel
          anchorTitle={anchorSolution?.title ?? "Solution signal"}
          anchorIsNeed={false}
          candidates={candidates}
          loading={panelLoading}
          onClose={() => setCandidateAnchor(null)}
          onPromote={handlePromote}
          promoteLoadingId={promoteLoadingId}
        />
      )}
    </div>
  );
}
