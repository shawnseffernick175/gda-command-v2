"use client";

import { useState } from "react";
import type { MatchEvidence } from "@/hooks/use-fastrac-bidirectional";

function Tag({ label }: { label: string }) {
  return (
    <span className="rounded border border-border bg-gda-bg-base px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
      {label}
    </span>
  );
}

export function EvidencePanel({
  evidence,
  needSource,
  needSourceUrl,
  needPublishedAt,
  solutionSource,
  solutionSourceUrl,
  solutionPublishedAt,
}: {
  evidence: MatchEvidence | null;
  needSource?: string;
  needSourceUrl?: string | null;
  needPublishedAt?: string | null;
  solutionSource?: string;
  solutionSourceUrl?: string | null;
  solutionPublishedAt?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!evidence) {
    return (
      <div className="border-t border-border pt-3 mt-2">
        <p className="text-[11px] text-muted-foreground">
          Evidence not captured for this historical match.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-border pt-2 mt-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        <span>Show evidence</span>
        <span>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 text-xs">
          <div>
            <p className="text-[11px] font-mono uppercase text-muted-foreground tracking-wide mb-1.5">
              Why this match was created:
            </p>
            <ul className="space-y-1 text-foreground list-disc list-inside">
              {evidence.mission_tag_overlap.length > 0 && (
                <li>
                  Mission tags overlap:{" "}
                  <span className="inline-flex gap-1 align-baseline">
                    {evidence.mission_tag_overlap.map((t) => (
                      <Tag key={t} label={t} />
                    ))}
                  </span>
                </li>
              )}
              {evidence.timing_window_alignment && (
                <li>
                  Both signals in{" "}
                  {evidence.timing_window_alignment.need === evidence.timing_window_alignment.solution
                    ? `${evidence.timing_window_alignment.need} horizon`
                    : `overlapping horizons (need: ${evidence.timing_window_alignment.need}; solution: ${evidence.timing_window_alignment.solution})`}
                  {" "}→ timing {Math.round(evidence.timing_window_alignment.score * 100)}%
                  {evidence.timing_window_alignment.score === 1 ? " (perfect)" : evidence.timing_window_alignment.score >= 0.75 ? " (1-window slip)" : ""}
                </li>
              )}
              {evidence.source_history && evidence.source_history.partnerships > 0 && (
                <li>
                  Source has prior collaboration: {evidence.source_history.partnerships} published
                  partnership{evidence.source_history.partnerships !== 1 ? "s" : ""}
                  {evidence.source_history.prior_collaborations.length > 0
                    ? ` (${evidence.source_history.prior_collaborations.join(", ")})`
                    : ""}
                </li>
              )}
              {evidence.pursuit_reasoning && (
                <li>
                  <span className="text-muted-foreground">Pursuit vehicle reasoning:</span>{" "}
                  {evidence.pursuit_reasoning}
                </li>
              )}
              {evidence.adoption_reasoning && (
                <li>
                  <span className="text-muted-foreground">Adoption path reasoning:</span>{" "}
                  {evidence.adoption_reasoning}
                </li>
              )}
            </ul>
          </div>

          {evidence.mission_tag_unmatched.length > 0 && (
            <div>
              <p className="text-[11px] font-mono uppercase text-muted-foreground tracking-wide mb-1">
                Unmatched tags
              </p>
              <div className="flex flex-wrap gap-1">
                {evidence.mission_tag_unmatched.map((t) => (
                  <Tag key={t} label={t} />
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] font-mono uppercase text-muted-foreground tracking-wide mb-1">
              Sources
            </p>
            <ul className="space-y-0.5 text-foreground list-disc list-inside">
              {needSource && (
                <li>
                  Need signal:{" "}
                  {needSourceUrl ? (
                    <a
                      href={needSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-gda-cyan hover:underline"
                    >
                      [{needSource}{needPublishedAt ? `, ${new Date(needPublishedAt).toLocaleDateString()}` : ""}]
                    </a>
                  ) : (
                    <span>[{needSource}{needPublishedAt ? `, ${new Date(needPublishedAt).toLocaleDateString()}` : ""}]</span>
                  )}
                </li>
              )}
              {solutionSource && (
                <li>
                  Solution signal:{" "}
                  {solutionSourceUrl ? (
                    <a
                      href={solutionSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-gda-cyan hover:underline"
                    >
                      [{solutionSource}{solutionPublishedAt ? `, ${new Date(solutionPublishedAt).toLocaleDateString()}` : ""}]
                    </a>
                  ) : (
                    <span>[{solutionSource}{solutionPublishedAt ? `, ${new Date(solutionPublishedAt).toLocaleDateString()}` : ""}]</span>
                  )}
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
