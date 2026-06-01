/**
 * DoctrineAlignmentPanel — collapsible panel showing doctrine evaluation
 * results on opportunity/capture detail pages. Shows 8 principles with
 * scores, exclusion triggers, margin check, and recommendations.
 */

import { useState } from 'react';
import { EvidenceBadge } from '../../components/EvidenceBadge';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { useDoctrineEvaluation, useRunDoctrineCheck } from './hooks/useDoctrineEvaluation';
import type { DoctrineEvaluation, PrincipleScore, ExclusionResult } from './types';

interface DoctrineAlignmentPanelProps {
  entityKind: string;
  entityId: string;
}

const principleDisplayNames: Record<string, string> = {
  alignment: 'Alignment',
  ethics_always: 'Ethics Always',
  teamwork: 'Teamwork',
  data_first: 'Data First, Then Debate',
  relentless_execution: 'Relentless Execution',
  relationships: 'Relationships',
  market_mission_brand: 'Market, Mission, Brand',
  customer_facing: 'Customer Facing',
};

function scoreColor(score: number): string {
  if (score >= 4) return 'text-accent';
  if (score >= 3) return 'text-warning';
  return 'text-critical';
}

function alignmentLabel(total: number): { label: string; color: string } {
  if (total >= 32) return { label: 'Strong alignment', color: 'text-accent' };
  if (total >= 24) return { label: 'Moderate alignment', color: 'text-warning' };
  return { label: 'Weak alignment', color: 'text-critical' };
}

function PrincipleRow({ id, score }: { id: string; score: PrincipleScore }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border last:border-b-0 py-3">
      <button
        type="button"
        className="w-full flex items-center justify-between text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink-primary">
            {principleDisplayNames[id] ?? id}
          </span>
          <EvidenceBadge grade={score.evidence_grade} />
        </div>
        <span className={`text-sm font-semibold tabular-nums ${scoreColor(score.score)}`}>
          {score.score}/5
        </span>
      </button>
      {expanded && (
        <div className="mt-2 pl-4 flex flex-col gap-1">
          <p className="text-xs text-ink-muted">{score.rationale}</p>
          {score.citations.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {score.citations.map((c, i) => (
                <span key={i} className="text-[11px] text-ink-muted italic">{c}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExclusionRow({ exclusion }: { exclusion: ExclusionResult }) {
  if (!exclusion.triggered) return null;

  return (
    <div className="rounded border border-l-4 border-l-critical border-border p-3 bg-surface">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-semibold border border-critical text-critical bg-critical/10">
          BLOCKED
        </span>
        <span className="text-sm font-medium text-ink-primary">{exclusion.name}</span>
      </div>
      {exclusion.evidence.length > 0 && (
        <p className="text-xs text-ink-muted mt-1">{exclusion.evidence.join('; ')}</p>
      )}
    </div>
  );
}

function EvaluationContent({ evaluation }: { evaluation: DoctrineEvaluation }) {
  const { label, color } = alignmentLabel(evaluation.alignment_total);
  const triggeredExclusions = evaluation.exclusion_triggers.filter(e => e.triggered);

  // Find lowest-scoring principle
  const sorted = Object.entries(evaluation.principle_scores).sort((a, b) => a[1].score - b[1].score);
  const lowestId = sorted[0]?.[0];

  return (
    <div className="flex flex-col gap-4">
      {/* Total score */}
      <div className="flex items-center justify-between">
        <span className={`text-lg font-semibold tabular-nums ${color}`}>
          {evaluation.alignment_total}/40
        </span>
        <span className={`text-sm font-medium ${color}`}>{label}</span>
      </div>

      {/* Exclusion alerts */}
      {triggeredExclusions.length > 0 && (
        <div className="flex flex-col gap-2">
          {triggeredExclusions.map((excl) => (
            <ExclusionRow key={excl.id} exclusion={excl} />
          ))}
        </div>
      )}

      {/* Margin check */}
      {!evaluation.margin_check.passed && (
        <div className="rounded border border-l-4 border-l-critical border-border p-3 bg-surface">
          <span className="text-sm font-medium text-critical">
            Margin {evaluation.margin_check.margin_pct}% below {evaluation.margin_check.threshold}% floor
          </span>
          <p className="text-xs text-ink-muted mt-1">
            Rule: doctrine_rules_config.margin_floor_pct = {evaluation.margin_check.threshold}
          </p>
        </div>
      )}

      {/* Principles */}
      <div className="border border-border rounded">
        {Object.entries(evaluation.principle_scores).map(([id, score]) => (
          <div
            key={id}
            className={id === lowestId ? 'bg-critical/5' : ''}
          >
            <div className="px-3">
              <PrincipleRow id={id} score={score} />
            </div>
          </div>
        ))}
      </div>

      {/* Lowest principle highlight */}
      {lowestId && sorted[0] && sorted[0][1].score <= 3 && (
        <div className="text-xs text-ink-muted border-l-2 border-l-critical pl-3">
          <span className="font-medium">Lowest:</span> {principleDisplayNames[lowestId]} ({sorted[0][1].score}/5)
          — {sorted[0][1].rationale}
        </div>
      )}

      {/* Recommendations */}
      {evaluation.recommendations.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold mb-2">
            Recommendations
          </h4>
          <ul className="flex flex-col gap-1">
            {evaluation.recommendations.map((rec, i) => (
              <li key={i} className="text-xs text-ink-primary pl-3 relative before:content-['—'] before:absolute before:left-0 before:text-ink-muted">
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-ink-muted italic">
        Evaluated {new Date(evaluation.evaluated_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
      </p>
    </div>
  );
}

export function DoctrineAlignmentPanel({ entityKind, entityId }: DoctrineAlignmentPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { latest, isLoading } = useDoctrineEvaluation(entityKind, entityId);
  const runCheck = useRunDoctrineCheck();

  return (
    <div className="border border-border rounded bg-surface" data-testid="doctrine-alignment-panel">
      <button
        type="button"
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h3 className="text-sm font-semibold text-ink-primary">Doctrine Alignment</h3>
        <span className="text-xs text-ink-muted">{collapsed ? '▶' : '▼'}</span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4">
          {isLoading && <Skeleton lines={4} />}
          {!isLoading && !latest && (
            <div className="text-center py-4">
              <p className="text-sm text-ink-muted mb-3">No doctrine evaluation yet.</p>
              <button
                type="button"
                className="text-sm font-medium text-accent hover:underline"
                onClick={() => runCheck.mutate({ entityKind, entityId })}
                disabled={runCheck.isPending}
              >
                {runCheck.isPending ? 'Evaluating…' : 'Run Doctrine Check'}
              </button>
            </div>
          )}
          {!isLoading && latest && <EvaluationContent evaluation={latest} />}
        </div>
      )}
    </div>
  );
}
