import { useState } from "react";
import { Button } from "../Button/Button";
import { SourceUrlChip, type SourceKind } from "../SourceUrlChip/SourceUrlChip";

export interface SourceRef {
  url: string;
  kind: SourceKind;
  label?: string;
}

/**
 * status semantics:
 *   - 'pending'  = awaiting operator approval action (NOT analysis state — analysis is always 200 or 503 per R2)
 *   - 'approved' = operator clicked Approve
 *   - 'rejected' = operator clicked Reject (sent to learning loop per D3 §8.4)
 *
 * This status is independent of R2 analysis status. R2 is enforced at the data
 * fetch layer (TanStack Query), not at this component.
 */
export interface AgentRecommendationCardProps {
  recommendation: string;
  confidence: "high" | "medium" | "low";
  sources: SourceRef[];
  reasoning?: string;
  onApprove: () => void;
  onReject: () => void;
  status?: "pending" | "approved" | "rejected";
}

const confidenceColors = {
  high: "bg-success/15 text-success",
  medium: "bg-warning/15 text-warning",
  low: "bg-critical/15 text-critical",
};

export function AgentRecommendationCard({
  recommendation,
  confidence,
  sources,
  reasoning,
  onApprove,
  onReject,
  status = "pending",
}: AgentRecommendationCardProps) {
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <div className="rounded-md border border-border bg-surface border-l-[4px] border-l-accent p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Agent Recommendation
        </span>
        <span
          className={`inline-flex items-center px-2 h-5 rounded-full text-xs font-medium ${confidenceColors[confidence]}`}
        >
          {confidence}
        </span>
      </div>

      <p className="text-sm text-ink-primary mb-3">&ldquo;{recommendation}&rdquo;</p>

      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {sources.map((s) => (
            <SourceUrlChip
              key={s.url}
              url={s.url}
              source_kind={s.kind}
              retrieved_at={new Date().toISOString()}
              label={s.label}
            />
          ))}
        </div>
      )}

      {reasoning && (
        <div className="mb-3">
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="text-xs text-ink-muted hover:text-ink-primary"
          >
            {showReasoning ? "▾ Hide reasoning" : "▸ Show reasoning"}
          </button>
          {showReasoning && (
            <p className="mt-2 text-sm text-ink-muted">{reasoning}</p>
          )}
        </div>
      )}

      {status === "pending" && (
        <div className="flex gap-2">
          <Button variant="primary" onClick={onApprove}>
            Approve
          </Button>
          <Button variant="secondary" onClick={onReject}>
            Reject
          </Button>
        </div>
      )}
      {status === "approved" && (
        <span className="text-xs text-success font-medium">Approved</span>
      )}
      {status === "rejected" && (
        <span className="text-xs text-ink-muted font-medium">Rejected</span>
      )}
    </div>
  );
}
