"use client";

import { useState, useEffect, useCallback } from "react";
import { useFastTrackList, useRunFastTrack } from "@/hooks/use-fast-track";
import {
  useFTSignals,
  useFTMatches,
  useFTMatchAnalysis,
  useRunFTMatchAnalysis,
} from "@/hooks/use-fast-track-signals";
import type { FTSignal, FTMatch, FTMatchAnalysis } from "@/hooks/use-fast-track-signals";
import { Badge } from "@/components/ui/badge";
import { SourceChip } from "@/components/shared/source-chip";
import { CollapseSection } from "@/components/shared/collapse-section";
import { cn } from "@/lib/utils";
import type { FastTrackAssessment } from "@/lib/types";

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
function SignalStrength({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" title={`Signal strength: ${value}/5`}>
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

function UrgencyBadge({ urgency }: { urgency: string | null }) {
  if (!urgency) return null;
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-mono uppercase", URGENCY_STYLES[urgency] ?? URGENCY_STYLES.low)}>
      {urgency}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// Priority/severity badge
// ────────────────────────────────────────────────────────────
const PRIORITY_STYLES: Record<string, string> = {
  high:   "bg-red-500/15 border-red-500/40 text-red-400",
  medium: "bg-amber-400/15 border-amber-400/40 text-amber-400",
  low:    "bg-muted/30 border-border text-muted-foreground",
};

function PriorityBadge({ value }: { value: string }) {
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-mono uppercase", PRIORITY_STYLES[value] ?? PRIORITY_STYLES.low)}>
      {value}
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
          <SignalStrength value={s.signal_strength} />
        </td>
        {/* Urgency */}
        <td className="px-3 py-2 text-left align-top">
          <UrgencyBadge urgency={s.urgency} />
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
function SignalTable({ signals, loading, showInstitution }: { signals: FTSignal[]; loading: boolean; showInstitution?: boolean }) {
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
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Source</th>
            <th className="px-3 py-2 text-left font-medium">Title / Mission Tags</th>
            {showInstitution && (
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Institution</th>
            )}
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Horizon</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Strength</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Urgency</th>
            <th className="px-3 py-2 text-left font-medium">Next Review Action</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => (
            <SignalRow key={s.id} s={s} showInstitution={showInstitution} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Score bar
// ────────────────────────────────────────────────────────────
function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gda-bg-base overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct >= 80 ? "bg-gda-green" : pct >= 60 ? "bg-gda-cyan" : pct >= 40 ? "bg-amber-400" : "bg-red-400"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Match drill-in panel
// ────────────────────────────────────────────────────────────
function MatchDrillIn({ m }: { m: FTMatch }) {
  const { data: analysis, isLoading: analysisLoading } = useFTMatchAnalysis(m.id);
  const runAnalysis = useRunFTMatchAnalysis();
  const [localAnalysis, setLocalAnalysis] = useState<FTMatchAnalysis | null>(null);

  const displayAnalysis = localAnalysis ?? analysis;
  const missionFit  = parseFloat(m.mission_fit_score);
  const techFit     = parseFloat(m.technical_fit_score);
  const timing      = parseFloat(m.timing_score);
  const overallPct  = Math.round(((missionFit + techFit + timing) / 3) * 100);

  const handleRunAnalysis = useCallback(async () => {
    try {
      const result = await runAnalysis.mutateAsync(m.id);
      setLocalAnalysis(result);
    } catch {
      // error is surfaced via runAnalysis.isError
    }
  }, [m.id, runAnalysis]);

  // Auto-run analysis on first open if no cached analysis exists
  const shouldAutoRun = !analysisLoading && !displayAnalysis && !runAnalysis.isPending;
  useEffect(() => {
    if (shouldAutoRun) {
      runAnalysis.mutateAsync(m.id).then(setLocalAnalysis).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoRun]);

  return (
    <div className="rounded border border-border bg-gda-panel p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-xs text-foreground font-semibold">
        <span>{m.tech_title}</span>
        <span className="text-muted-foreground">×</span>
        <span>{m.req_title}</span>
        <span className="ml-auto">
          <span className={cn(
            "rounded-full border px-2 py-0.5 font-mono text-[11px]",
            overallPct >= 80 ? "border-gda-green text-gda-green" : overallPct >= 60 ? "border-gda-cyan text-gda-cyan" : "border-amber-400 text-amber-400"
          )}>
            {overallPct}% match
          </span>
        </span>
      </div>

      {(analysisLoading || runAnalysis.isPending) && !displayAnalysis && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-gda-bg-base" />
          ))}
          <p className="text-[11px] text-muted-foreground animate-pulse">Running Envision broker analysis…</p>
        </div>
      )}

      {displayAnalysis && (
        <>
          {/* Broker Role */}
          {displayAnalysis.broker_role && (
            <div>
              <p className="text-[11px] font-mono uppercase text-gda-cyan tracking-wide mb-1">Broker Role</p>
              <p className="text-xs text-foreground">{displayAnalysis.broker_role}</p>
            </div>
          )}

          {/* Gap Analysis */}
          {displayAnalysis.gap_analysis && (
            <div>
              <p className="text-[11px] font-mono uppercase text-muted-foreground tracking-wide mb-1">Gap Analysis</p>
              <p className="text-xs text-foreground">{displayAnalysis.gap_analysis}</p>
            </div>
          )}

          {/* Envision Fit */}
          {displayAnalysis.envision_fit && (
            <div>
              <p className="text-[11px] font-mono uppercase text-gda-green tracking-wide mb-1">Envision Fit</p>
              <p className="text-xs text-foreground">{displayAnalysis.envision_fit}</p>
            </div>
          )}

          {/* Recommended Actions */}
          {displayAnalysis.recommended_actions && displayAnalysis.recommended_actions.length > 0 && (
            <div>
              <p className="text-[11px] font-mono uppercase text-muted-foreground tracking-wide mb-2">Recommended Actions</p>
              <div className="rounded border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-gda-bg-base text-[11px] text-muted-foreground">
                      <th className="px-3 py-1.5 text-left font-medium">Action</th>
                      <th className="px-3 py-1.5 text-left font-medium">Priority</th>
                      <th className="px-3 py-1.5 text-left font-medium">Vehicle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayAnalysis.recommended_actions.map((a, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-3 py-1.5 text-xs text-foreground">{a.action}</td>
                        <td className="px-3 py-1.5"><PriorityBadge value={a.priority} /></td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{a.vehicle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Risk Flags */}
          {displayAnalysis.risk_flags && displayAnalysis.risk_flags.length > 0 && (
            <div>
              <p className="text-[11px] font-mono uppercase text-muted-foreground tracking-wide mb-2">Risk Flags</p>
              <div className="space-y-1">
                {displayAnalysis.risk_flags.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <PriorityBadge value={r.severity} />
                    <span className="text-xs text-foreground">{r.risk}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Narrative */}
          {displayAnalysis.ai_narrative && (
            <div className="border-t border-border pt-3">
              <p className="text-[11px] font-mono uppercase text-muted-foreground tracking-wide mb-1">Executive Brief</p>
              <p className="text-xs text-foreground leading-relaxed">{displayAnalysis.ai_narrative}</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border pt-2">
            <div className="flex items-center gap-2">
              {displayAnalysis.model_used && <span className="font-mono">{displayAnalysis.model_used}</span>}
              {displayAnalysis.generated_at && (
                <span>· {new Date(displayAnalysis.generated_at).toLocaleDateString()}</span>
              )}
            </div>
            <SourceChip label="AI Analysis" kind="heuristic" />
          </div>
        </>
      )}

      {!displayAnalysis && !analysisLoading && !runAnalysis.isPending && (
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground mb-2">No analysis available yet</p>
          <button
            onClick={handleRunAnalysis}
            disabled={runAnalysis.isPending}
            className="rounded border border-gda-cyan bg-gda-cyan/10 px-4 py-1.5 text-xs font-mono font-medium text-gda-cyan hover:bg-gda-cyan/20 disabled:opacity-50 transition-colors"
          >
            Run Analysis
          </button>
        </div>
      )}

      {runAnalysis.isError && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          Analysis failed — try again
        </div>
      )}

      {/* Re-run button */}
      {displayAnalysis && (
        <div className="flex justify-end">
          <button
            onClick={handleRunAnalysis}
            disabled={runAnalysis.isPending}
            className="rounded border border-border bg-gda-bg-base px-3 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-gda-panel disabled:opacity-50 transition-colors"
          >
            {runAnalysis.isPending ? "Analyzing…" : "Re-run Analysis"}
          </button>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Match card
// ────────────────────────────────────────────────────────────
function MatchCard({ m }: { m: FTMatch }) {
  const [drillInOpen, setDrillInOpen] = useState(false);
  const missionFit  = parseFloat(m.mission_fit_score);
  const techFit     = parseFloat(m.technical_fit_score);
  const timing      = parseFloat(m.timing_score);
  const overallPct  = Math.round(((missionFit + techFit + timing) / 3) * 100);

  return (
    <div className="space-y-0">
      <div className="rounded border border-border bg-gda-panel p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Technology Signal</p>
            {m.tech_source_url ? (
              <a href={m.tech_source_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-gda-cyan hover:underline leading-snug">{m.tech_title}</a>
            ) : (
              <p className="text-xs font-semibold text-foreground leading-snug">{m.tech_title}</p>
            )}
            <p className="text-[11px] text-gda-cyan mt-0.5">{m.tech_source}</p>
          </div>
          <div className="flex flex-col items-center px-3 shrink-0">
            <span className={cn(
              "text-lg font-mono font-bold rounded-full border w-10 h-10 flex items-center justify-center",
              overallPct >= 80 ? "border-gda-green text-gda-green bg-gda-green/10"
              : overallPct >= 60 ? "border-gda-cyan text-gda-cyan bg-gda-cyan/10"
              : "border-amber-400 text-amber-400 bg-amber-400/10"
            )}>
              {overallPct}
            </span>
            <span className="text-[11px] text-muted-foreground mt-0.5">match</span>
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Requirement Signal</p>
            {m.req_source_url ? (
              <a href={m.req_source_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-gda-cyan hover:underline leading-snug">{m.req_title}</a>
            ) : (
              <p className="text-xs font-semibold text-foreground leading-snug">{m.req_title}</p>
            )}
            <p className="text-[11px] text-gda-cyan mt-0.5">{m.req_source}</p>
          </div>
        </div>

        {/* Scores */}
        <div className="space-y-1.5">
          <ScoreBar label="Mission Fit"   value={missionFit} />
          <ScoreBar label="Technical Fit" value={techFit} />
          <ScoreBar label="Timing"        value={timing} />
        </div>

        {/* Vehicle + path */}
        {(m.recommended_vehicle || m.adoption_path) && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
            {m.recommended_vehicle && (
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Recommended Vehicle</p>
                <p className="text-xs text-gda-green font-medium">{m.recommended_vehicle}</p>
              </div>
            )}
            {m.adoption_path && (
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Adoption Path</p>
                <p className="text-xs text-foreground">{m.adoption_path}</p>
              </div>
            )}
          </div>
        )}

        {/* Rationale */}
        {m.match_rationale && (
          <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-2 mt-1">
            {m.match_rationale}
          </p>
        )}

        {/* Shared mission tags */}
        {m.tech_mission_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {m.tech_mission_tags.map((t) => <Tag key={t} label={t} />)}
          </div>
        )}

        {/* View Full Analysis button */}
        <div className="flex justify-end pt-1">
          <button
            onClick={() => setDrillInOpen((v) => !v)}
            className="rounded border border-gda-cyan bg-gda-cyan/10 px-3 py-1 text-[11px] font-mono font-medium text-gda-cyan hover:bg-gda-cyan/20 transition-colors"
          >
            {drillInOpen ? "Hide Analysis" : "View Full Analysis"}
          </button>
        </div>
      </div>

      {/* Drill-in panel */}
      {drillInOpen && (
        <div className="mt-2">
          <MatchDrillIn m={m} />
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Pipeline side tab switcher
// ────────────────────────────────────────────────────────────
type PipelineSide = "government" | "industry";

function SideTabSwitcher({ activeSide, onChange }: { activeSide: PipelineSide; onChange: (s: PipelineSide) => void }) {
  return (
    <div className="flex gap-1 mb-3">
      <button
        onClick={() => onChange("government")}
        className={cn(
          "rounded px-3 py-1 text-xs font-mono font-medium transition-colors border",
          activeSide === "government"
            ? "bg-gda-green/15 border-gda-green/40 text-gda-green"
            : "bg-gda-bg-base border-border text-muted-foreground hover:text-foreground"
        )}
      >
        Government
      </button>
      <button
        onClick={() => onChange("industry")}
        className={cn(
          "rounded px-3 py-1 text-xs font-mono font-medium transition-colors border",
          activeSide === "industry"
            ? "bg-gda-cyan/15 border-gda-cyan/40 text-gda-cyan"
            : "bg-gda-bg-base border-border text-muted-foreground hover:text-foreground"
        )}
      >
        Industry
      </button>
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
export default function FastTrackPage() {
  const [activeSide, setActiveSide] = useState<PipelineSide>("government");
  const { data: listData,    isLoading: listLoading    } = useFastTrackList();
  const { data: signalsData, isLoading: signalsLoading } = useFTSignals(activeSide);
  const { data: matchesData, isLoading: matchesLoading } = useFTMatches();
  const runTriage = useRunFastTrack();

  const [form, setForm]       = useState({ ...EMPTY_FORM });
  const [result, setResult]   = useState<TriageResult | null>(null);
  const [triaging, setTriaging] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const recent      = listData?.items ?? [];
  const techSignals = signalsData?.tech ?? [];
  const reqSignals  = signalsData?.requirement ?? [];
  const matches     = matchesData?.matches ?? [];
  const isIndustry  = activeSide === "industry";

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
      <div className="sticky top-0 z-20 bg-gda-bg-deep border-b border-border pb-3 -mx-6 px-6 -mt-6 pt-6 space-y-6 sticky-page-header">
        <div>
          <h1 className="font-mono text-lg font-bold text-foreground">Fast Track</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Need Sensing — monitor emerging technology & requirement signals, match them, and surface the right pursuit vehicle
          </p>
        </div>

        {/* ── Pipeline Side Tabs ────────────────────────────────── */}
        <SideTabSwitcher activeSide={activeSide} onChange={setActiveSide} />
      </div>

      {/* ── NEED SENSING: Technology Pipeline ────────────────── */}
      <CollapseSection
        id="ft-tech-pipeline"
        title={`Emerging Technology Pipeline (${techSignals.length})`}
        defaultOpen={true}
      >
        <div className="mb-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {isIndustry
              ? "Academic papers, FFRDC research outputs, innovation factory results, and startup dual-use capabilities that align with Envision's mission areas."
              : "Watches DARPA, DIU, AFWERX, NavalX Tech Bridges, Army Applications Lab, NSIN, SBIR/STTR, startups and niche commercial firms for maturing dual-use capabilities that align with Envision's mission areas."}
          </p>
        </div>
        <SignalTable signals={techSignals} loading={signalsLoading} showInstitution={isIndustry} />
      </CollapseSection>

      {/* ── NEED SENSING: Requirements Pipeline ──────────────── */}
      <CollapseSection
        id="ft-req-pipeline"
        title={`Emerging Requirements Pipeline (${reqSignals.length})`}
        defaultOpen={true}
      >
        <div className="mb-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {isIndustry
              ? "FFRDC reports, university research outputs, and innovation factory assessments that surface emerging requirement patterns before formal procurements."
              : "Tracks procurement forecasts, sources sought, RFIs, industry days, draft RFPs, CSOs, and post-RFI formal opportunities to surface demand signals before they become competed awards."}
          </p>
        </div>
        <SignalTable signals={reqSignals} loading={signalsLoading} showInstitution={isIndustry} />
      </CollapseSection>

      {/* ── NEED SENSING: Matched Pairs ───────────────────────── */}
      <CollapseSection
        id="ft-matches"
        title={`Technology × Requirement Matches (${matches.length})`}
        defaultOpen={true}
      >
        <div className="mb-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Signals are normalized on mission, problem, maturity, urgency, and transition tags, then scored on mission fit, technical fit, and timing. Each match recommends a pursuit vehicle — direct contract, partner vehicle, subcontract, SBIR/STTR, CSO, or OT Agreement.
          </p>
        </div>
        {matchesLoading ? (
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
            {matches.map((m) => <MatchCard key={m.id} m={m} />)}
          </div>
        )}
      </CollapseSection>

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
