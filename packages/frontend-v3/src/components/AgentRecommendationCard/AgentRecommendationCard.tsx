import type { AgentRecommendationCardProps } from '../../types';
import { useState } from 'react';
import { Button } from '../Button/Button';
import { SourceUrlChip } from '../SourceUrlChip/SourceUrlChip';

const confidenceColors: Record<string, string> = {
  high: 'bg-success/15 text-success',
  medium: 'bg-warning/15 text-warning',
  low: 'bg-critical/15 text-critical',
};

/**
 * status semantics:
 *   - 'pending'  = awaiting operator approval action (NOT analysis state — analysis is always 200 or 503 per R2)
 *   - 'approved' = operator clicked Approve
 *   - 'rejected' = operator clicked Reject (sent to learning loop per D3 §8.4)
 */
export function AgentRecommendationCard({
  recommendation,
  confidence,
  sources,
  reasoning,
  onApprove,
  onReject,
  status = 'pending',
}: AgentRecommendationCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-border bg-surface border-l-4 border-l-accent p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">Agent Recommendation</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${confidenceColors[confidence]}`}>
          Confidence: {confidence.charAt(0).toUpperCase() + confidence.slice(1)}
        </span>
      </div>

      <p className="text-sm text-ink-primary mb-4">{'\u201C'}{recommendation}{'\u201D'}</p>

      {sources.length > 0 && (
        <div className="mb-4">
          <span className="text-xs text-ink-muted block mb-2">Sources:</span>
          <div className="flex flex-wrap gap-2">
            {sources.map((src, i) => (
              <SourceUrlChip key={i} url={src.url} source_kind={src.kind} retrieved_at={new Date().toISOString()} {...(src.label !== undefined ? { label: src.label } : {})} />
            ))}
          </div>
        </div>
      )}

      {reasoning && (
        <div className="mb-4">
          <button
            type="button"
            className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '▾' : '▸'} Show reasoning
          </button>
          {expanded && <p className="mt-2 text-sm text-ink-muted">{reasoning}</p>}
        </div>
      )}

      {status === 'pending' && (
        <div className="flex gap-2">
          <Button variant="primary" onClick={onApprove}>Approve</Button>
          <Button variant="secondary" onClick={onReject}>Reject</Button>
        </div>
      )}
      {status === 'approved' && <span className="text-xs text-success font-medium">Approved</span>}
      {status === 'rejected' && <span className="text-xs text-ink-muted font-medium">Rejected</span>}
    </div>
  );
}
