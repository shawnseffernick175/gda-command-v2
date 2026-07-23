"use client";

import { cn } from "@/lib/utils";
import type { FTMatchWithEvidence } from "@/hooks/use-fastrac-bidirectional";
import { EvidencePanel } from "./EvidencePanel";

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[12px] text-muted-foreground">
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

function Tag({ label }: { label: string }) {
  return (
    <span className="rounded border border-border bg-gda-bg-base px-1.5 py-0.5 text-[12px] font-mono text-muted-foreground">
      {label}
    </span>
  );
}

export function MatchCardV2({ m }: { m: FTMatchWithEvidence }) {
  const missionFit = parseFloat(m.mission_fit_score);
  const techFit = parseFloat(m.technical_fit_score);
  const timing = parseFloat(m.timing_score);
  const overallPct = Math.round(((missionFit + techFit + timing) / 3) * 100);

  const allTags = [
    ...new Set([...m.need_mission_tags, ...m.solution_mission_tags]),
  ];

  return (
    <div className="rounded border border-border bg-gda-panel p-4 space-y-3">
      {/* Header: Need × Score × Solution */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-muted-foreground uppercase tracking-wide mb-0.5">
            Need Signal
          </p>
          {m.need_source_url ? (
            <a
              href={m.need_source_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-gda-cyan hover:underline leading-snug"
            >
              {m.need_title}
            </a>
          ) : (
            <p className="text-xs font-semibold text-foreground leading-snug">
              {m.need_title}
            </p>
          )}
          <p className="text-[12px] text-gda-cyan mt-0.5">
            {m.need_institution ?? m.need_source}
          </p>
        </div>

        <div className="flex flex-col items-center px-3 shrink-0">
          <span
            className={cn(
              "text-lg font-mono font-bold rounded-full border w-10 h-10 flex items-center justify-center",
              overallPct >= 80
                ? "border-gda-green text-gda-green bg-gda-green/10"
                : overallPct >= 60
                ? "border-gda-cyan text-gda-cyan bg-gda-cyan/10"
                : "border-amber-400 text-amber-400 bg-amber-400/10"
            )}
          >
            {overallPct}
          </span>
          <span className="text-[12px] text-muted-foreground mt-0.5">match</span>
        </div>

        <div className="flex-1 min-w-0 text-right">
          <p className="text-[12px] text-muted-foreground uppercase tracking-wide mb-0.5">
            Solution Signal
          </p>
          {m.solution_source_url ? (
            <a
              href={m.solution_source_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-gda-cyan hover:underline leading-snug"
            >
              {m.solution_title}
            </a>
          ) : (
            <p className="text-xs font-semibold text-foreground leading-snug">
              {m.solution_title}
            </p>
          )}
          <p className="text-[12px] text-gda-cyan mt-0.5">
            {m.solution_institution ?? m.solution_source}
          </p>
        </div>
      </div>

      {/* Score bars */}
      <div className="space-y-1.5">
        <ScoreBar label="Mission Fit" value={missionFit} />
        <ScoreBar label="Technical Fit" value={techFit} />
        <ScoreBar label="Timing" value={timing} />
      </div>

      {/* Recommended pursuit + adoption path */}
      {(m.recommended_vehicle || m.adoption_path) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
          {m.recommended_vehicle && (
            <div>
              <p className="text-[12px] text-muted-foreground uppercase tracking-wide mb-0.5">
                Recommended pursuit
              </p>
              <p className="text-xs text-gda-green font-medium">
                {m.recommended_vehicle}
              </p>
            </div>
          )}
          {m.adoption_path && (
            <div>
              <p className="text-[12px] text-muted-foreground uppercase tracking-wide mb-0.5">
                Adoption path
              </p>
              <p className="text-xs text-foreground">{m.adoption_path}</p>
            </div>
          )}
        </div>
      )}

      {/* Mission tags */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {allTags.map((t) => (
            <Tag key={t} label={t} />
          ))}
        </div>
      )}

      {/* Evidence panel — collapsed by default */}
      <EvidencePanel
        evidence={m.evidence}
        needSource={m.need_source}
        needSourceUrl={m.need_source_url}
        solutionSource={m.solution_source}
        solutionSourceUrl={m.solution_source_url}
      />
    </div>
  );
}
