import { Button } from '../../../components/Button/Button';
import { StageChip } from './StageChip';
import { SourceLink } from '../../opportunities/components/SourceLink';
import { formatDate, formatValueCents } from '../format';
import { suggestionSourceRefs, sourceLabel } from '../source-url';
import type { MatchSuggestion, SuggestionAction } from '../types';

/**
 * F-422: one row in the Review Matches queue.
 *
 * A "say-something" card: it leads with the suggested cross-source link
 * (source + native id, R1-linked back to the origin record), the confidence
 * tier, and the opportunity context (title/agency/value/due) so the reviewer
 * can decide confirm vs reject without leaving the queue. The two actions map
 * to POST /v3/match-suggestions. While a decision is in flight the buttons are
 * disabled; once decided the card collapses to a resolved state.
 */

interface SuggestionCardProps {
  suggestion: MatchSuggestion;
  onDecide: (linkId: number, action: SuggestionAction) => void;
  /** True while THIS card's decision request is in flight. */
  isDeciding: boolean;
  /** Set after a successful decision so the card shows a resolved state. */
  decidedAs?: SuggestionAction;
}

function confidenceClasses(confidence: string | null): string {
  // MEDIUM = warning tone, LOW = dim. No gold (color lock).
  return confidence === 'MEDIUM'
    ? 'bg-warning/15 text-warning'
    : 'bg-surface-raised text-ink-muted';
}

export function SuggestionCard({
  suggestion,
  onDecide,
  isDeciding,
  decidedAs,
}: SuggestionCardProps) {
  const { opportunity: opp } = suggestion;
  const refs = suggestionSourceRefs(
    suggestion.source,
    suggestion.source_native_id,
    suggestion.matched_at,
  );

  return (
    <div
      className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4"
      data-testid={`suggestion-${suggestion.link_id}`}
      data-decided={decidedAs ?? ''}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <StageChip stage={opp.lifecycle_stage} />
            <span
              className={`inline-flex items-center h-5 px-2 rounded-full text-xs font-medium ${confidenceClasses(
                suggestion.confidence,
              )}`}
              data-testid={`confidence-${suggestion.link_id}`}
              data-confidence={suggestion.confidence ?? ''}
            >
              {suggestion.confidence ?? 'UNKNOWN'} confidence
            </span>
          </div>
          <SourceLink
            value={
              <span className="text-base font-semibold text-ink-primary">
                {opp.title ?? 'Untitled opportunity'}
              </span>
            }
            sources={refs}
            data-testid={`suggestion-title-${suggestion.link_id}`}
          />
        </div>
      </div>

      {/* Context grid: what is being matched and why. */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
        <div className="flex flex-col">
          <span className="text-xs text-ink-dim">Suggested source</span>
          <SourceLink
            value={
              <span className="text-ink-primary">
                {sourceLabel(suggestion.source)} · {suggestion.source_native_id}
              </span>
            }
            sources={refs}
            data-testid={`suggestion-source-${suggestion.link_id}`}
          />
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-ink-dim">Agency</span>
          <SourceLink
            value={<span className="text-ink-muted">{opp.agency ?? '—'}</span>}
            sources={refs}
            data-testid={`suggestion-agency-${suggestion.link_id}`}
          />
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-ink-dim">Est. value</span>
          <SourceLink
            value={
              <span className="text-ink-primary" data-numeric>
                {formatValueCents(opp.estimated_value_cents)}
              </span>
            }
            sources={refs}
            data-testid={`suggestion-value-${suggestion.link_id}`}
          />
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-ink-dim">Response due</span>
          <SourceLink
            value={
              <span className="text-ink-primary">{formatDate(opp.response_due_at)}</span>
            }
            sources={refs}
            data-testid={`suggestion-due-${suggestion.link_id}`}
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-ink-dim">
          {suggestion.match_method ? `Matched via ${suggestion.match_method}` : 'Cross-source match'}
          {suggestion.matched_at ? ` · ${formatDate(suggestion.matched_at)}` : ''}
        </span>

        {decidedAs ? (
          <span
            className={`text-sm font-medium ${
              decidedAs === 'confirm' ? 'text-success' : 'text-ink-muted'
            }`}
            data-testid={`resolved-${suggestion.link_id}`}
          >
            {decidedAs === 'confirm' ? 'Confirmed' : 'Rejected'}
          </span>
        ) : (
          <div className="flex gap-2" data-testid={`actions-${suggestion.link_id}`}>
            <span data-testid={`reject-${suggestion.link_id}`}>
              <Button
                variant="secondary"
                size="sm"
                disabled={isDeciding}
                loading={isDeciding}
                onClick={() => onDecide(suggestion.link_id, 'reject')}
              >
                Reject
              </Button>
            </span>
            <span data-testid={`confirm-${suggestion.link_id}`}>
              <Button
                variant="primary"
                size="sm"
                disabled={isDeciding}
                loading={isDeciding}
                onClick={() => onDecide(suggestion.link_id, 'confirm')}
              >
                Confirm
              </Button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
