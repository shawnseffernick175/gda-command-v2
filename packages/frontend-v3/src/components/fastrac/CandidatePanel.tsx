"use client";

import { cn } from "@/lib/utils";
import type { ScoredCandidate } from "@/hooks/use-fastrac-bidirectional";
import { EvidencePanel } from "./EvidencePanel";

function Tag({ label }: { label: string }) {
  return (
    <span className="rounded border border-border bg-gda-bg-base px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
      {label}
    </span>
  );
}

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

function MiniMatchCard({
  candidate,
  anchorIsNeed,
  onPromote,
  promoteLoading,
}: {
  candidate: ScoredCandidate;
  anchorIsNeed: boolean;
  onPromote: () => void;
  promoteLoading: boolean;
}) {
  const overallPct = Math.round(candidate.overall_score * 100);
  const counterTitle = anchorIsNeed ? candidate.solution_title : candidate.need_title;
  const counterSource = anchorIsNeed ? candidate.solution_source : candidate.need_source;
  const counterUrl = anchorIsNeed ? candidate.solution_source_url : candidate.need_source_url;

  return (
    <div className="rounded border border-border bg-gda-panel p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">
            {anchorIsNeed ? "Solution" : "Need"}
          </p>
          {counterUrl ? (
            <a
              href={counterUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-gda-cyan hover:underline leading-snug"
            >
              {counterTitle}
            </a>
          ) : (
            <p className="text-xs font-semibold text-foreground leading-snug">
              {counterTitle}
            </p>
          )}
          <p className="text-[11px] text-gda-cyan mt-0.5">{counterSource}</p>
        </div>

        <div className="flex flex-col items-center shrink-0">
          <span
            className={cn(
              "text-sm font-mono font-bold rounded-full border w-8 h-8 flex items-center justify-center",
              overallPct >= 80
                ? "border-gda-green text-gda-green bg-gda-green/10"
                : overallPct >= 60
                ? "border-gda-cyan text-gda-cyan bg-gda-cyan/10"
                : "border-amber-400 text-amber-400 bg-amber-400/10"
            )}
          >
            {overallPct}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <ScoreBar label="Mission Fit" value={candidate.mission_fit_score} />
        <ScoreBar label="Technical Fit" value={candidate.technical_fit_score} />
        <ScoreBar label="Timing" value={candidate.timing_score} />
      </div>

      {candidate.recommended_vehicle && (
        <p className="text-[11px] text-gda-green">
          {candidate.recommended_vehicle}
        </p>
      )}

      {candidate.evidence.mission_tag_overlap.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {candidate.evidence.mission_tag_overlap.map((t) => (
            <Tag key={t} label={t} />
          ))}
        </div>
      )}

      <EvidencePanel
        evidence={candidate.evidence}
        needSource={candidate.need_source}
        needSourceUrl={candidate.need_source_url}
        solutionSource={candidate.solution_source}
        solutionSourceUrl={candidate.solution_source_url}
      />

      <div className="flex justify-end pt-1">
        <button
          onClick={onPromote}
          disabled={promoteLoading}
          className="rounded border border-gda-green bg-gda-green/10 px-3 py-1 text-[11px] font-mono font-medium text-gda-green hover:bg-gda-green/20 disabled:opacity-50 transition-colors"
        >
          {promoteLoading ? "Saving…" : "Save as Match"}
        </button>
      </div>
    </div>
  );
}

export function CandidatePanel({
  anchorTitle,
  anchorIsNeed,
  candidates,
  loading,
  onClose,
  onPromote,
  promoteLoadingId,
}: {
  anchorTitle: string;
  anchorIsNeed: boolean;
  candidates: ScoredCandidate[];
  loading: boolean;
  onClose: () => void;
  onPromote: (needId: string, solutionId: string) => void;
  promoteLoadingId: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg bg-gda-bg-deep border-l border-border overflow-y-auto">
        <div className="sticky top-0 z-10 bg-gda-bg-deep border-b border-border px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {anchorIsNeed ? "Solutions for" : "Needs for"}
            </p>
            <p className="text-xs font-semibold text-foreground mt-0.5 line-clamp-1">
              {anchorTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded border border-border bg-gda-bg-base px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded bg-gda-bg-base" />
              ))}
              <p className="text-[11px] text-muted-foreground text-center animate-pulse">
                Computing matches…
              </p>
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No candidates found in the signal corpus
            </p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                Top {candidates.length} ranked {anchorIsNeed ? "solutions" : "needs"}:
              </p>
              {candidates.map((c) => (
                <MiniMatchCard
                  key={`${c.need_signal_id}-${c.solution_signal_id}`}
                  candidate={c}
                  anchorIsNeed={anchorIsNeed}
                  onPromote={() =>
                    onPromote(c.need_signal_id, c.solution_signal_id)
                  }
                  promoteLoading={
                    promoteLoadingId ===
                    `${c.need_signal_id}-${c.solution_signal_id}`
                  }
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
