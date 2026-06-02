import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button/Button';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { Card } from '../../components/Card/Card';
import { Chip } from '../../components/Chip/Chip';
import { useUnifiedDetail } from './hooks/useUnifiedDetail';
import type {
  UnifiedOpportunityDetail,
  MergedField,
  FieldConflict,
  LineageEntry,
} from './types';

// ─── Display helpers ─────────────────────────────────────────────────────────

/** Lifecycle stages in canonical order, for the lineage trail (doc §7.2.3). */
const STAGE_ORDER = ['signal', 'forecast', 'pre_sol', 'solicitation', 'awarded', 'post_award'] as const;

const STAGE_LABELS: Record<string, string> = {
  signal: 'Signal',
  forecast: 'Forecast',
  pre_sol: 'Pre-Sol',
  solicitation: 'Solicitation',
  awarded: 'Awarded',
  post_award: 'Post-Award',
  closed: 'Closed',
};

/** Human labels for merged fields, in display order. */
const FIELD_LABELS: Array<{ key: string; label: string }> = [
  { key: 'title', label: 'Title' },
  { key: 'agency', label: 'Agency' },
  { key: 'office', label: 'Office' },
  { key: 'naics', label: 'NAICS' },
  { key: 'psc', label: 'PSC' },
  { key: 'set_aside', label: 'Set-Aside' },
  { key: 'estimated_value_cents', label: 'Estimated Value' },
  { key: 'posted_at', label: 'Posted' },
  { key: 'response_due_at', label: 'Response Due' },
  { key: 'award_at', label: 'Award Date' },
];

const DATE_FIELDS = new Set(['posted_at', 'response_due_at', 'award_at']);
const EM_DASH = '\u2014';

function formatDate(iso: unknown): string {
  if (iso == null || typeof iso !== 'string') return EM_DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMoneyCents(cents: unknown): string {
  if (cents == null || typeof cents !== 'number' || Number.isNaN(cents)) return EM_DASH;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatFieldValue(key: string, value: unknown): string {
  if (value == null || value === '') return EM_DASH;
  if (key === 'estimated_value_cents') return formatMoneyCents(value);
  if (DATE_FIELDS.has(key)) return formatDate(value);
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Map a confidence string to the Chip's confidence levels. */
function confidenceLevel(c: string | null): 'high' | 'medium' | 'low' | undefined {
  if (!c) return undefined;
  const v = c.toUpperCase();
  if (v === 'HIGH' || v === 'CONFIRMED') return 'high';
  if (v === 'MEDIUM') return 'medium';
  if (v === 'LOW') return 'low';
  return undefined;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Doc §7.2.1 — one badge per distinct source represented in this opp. */
function SourceBadgeStrip({ sources }: { sources: string[] }) {
  if (sources.length === 0) {
    return <span className="text-sm text-ink-muted">No sources</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="source-badge-strip">
      {sources.map((s) => (
        <Chip key={s} label={s} variant="default" />
      ))}
    </div>
  );
}

/** Doc §7.2.3 — horizontal lineage trail, filled dots for stages hit. */
function LineageTrail({ currentStage }: { currentStage: string }) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage as (typeof STAGE_ORDER)[number]);
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="lineage-trail">
      {STAGE_ORDER.map((stage, idx) => {
        const reached = currentIdx >= 0 && idx <= currentIdx;
        return (
          <span key={stage} className="flex items-center gap-1">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                reached ? 'bg-accent' : 'border border-border'
              }`}
              aria-hidden="true"
            />
            <span className={`text-xs ${reached ? 'text-ink-primary' : 'text-ink-dim'}`}>
              {STAGE_LABELS[stage]}
            </span>
            {idx < STAGE_ORDER.length - 1 && <span className="mx-1 text-ink-dim">·</span>}
          </span>
        );
      })}
    </div>
  );
}

/** A single merged field row: label, value, and the source that supplied it. */
function MergedFieldRow({
  label,
  fieldKey,
  field,
  inConflict,
}: {
  label: string;
  fieldKey: string;
  field: MergedField | undefined;
  inConflict: boolean;
}) {
  const value = field?.value ?? null;
  const source = field?.source ?? null;
  return (
    <div className="flex flex-col gap-1 py-2 border-b border-border last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-[0.04em] text-ink-muted">{label}</span>
        {inConflict && (
          <span className="text-xs font-medium text-warning" data-testid="conflict-flag">
            conflict
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-primary">{formatFieldValue(fieldKey, value)}</span>
        {source && (
          <span className="text-xs text-ink-dim shrink-0" data-testid="field-source">
            via {source}
          </span>
        )}
      </div>
    </div>
  );
}

/** Conflict drawer content — per-field, all source values + which one won. */
function ConflictList({ conflicts }: { conflicts: FieldConflict[] }) {
  if (conflicts.length === 0) {
    return <p className="text-sm text-ink-muted">No fields conflict across sources.</p>;
  }
  return (
    <div className="flex flex-col gap-4" data-testid="conflict-list">
      {conflicts.map((c) => {
        const fieldLabel = FIELD_LABELS.find((f) => f.key === c.field)?.label ?? c.field;
        return (
          <Card key={c.field} padding="sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-ink-primary">{fieldLabel}</span>
              <span className="text-xs text-warning">{c.values.length} sources disagree</span>
            </div>
            <ul className="flex flex-col gap-1">
              {c.values.map((v, i) => {
                const won = v.source === c.chosen;
                return (
                  <li
                    key={`${v.source}-${i}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className={won ? 'text-ink-primary font-medium' : 'text-ink-muted'}>
                      {formatFieldValue(c.field, v.value)}
                    </span>
                    <span className="text-xs text-ink-dim shrink-0">
                      {v.source}
                      {won && <span className="ml-1 text-accent">chosen</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

/** Lineage table — every link row with match metadata. */
function LineageTable({ lineage }: { lineage: LineageEntry[] }) {
  if (lineage.length === 0) {
    return <p className="text-sm text-ink-muted">No lineage records.</p>;
  }
  return (
    <div className="flex flex-col gap-2" data-testid="lineage-table">
      {lineage.map((l, i) => (
        <Card key={`${l.source}-${l.source_native_id}-${i}`} padding="sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink-primary">{l.source}</span>
              <span className="text-xs text-ink-dim">{l.source_native_id}</span>
            </div>
            {(() => {
              const lvl = confidenceLevel(l.confidence);
              if (lvl) {
                return <Chip label={l.confidence ?? ''} variant="confidence" level={lvl} />;
              }
              return l.confidence ? (
                <span className="text-xs text-ink-muted">{l.confidence}</span>
              ) : null;
            })()}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            {l.match_method && <span>Method: {l.match_method}</span>}
            {l.matched_at && <span>Matched {relativeTime(l.matched_at)}</span>}
            {l.confirmed_by && <span>Confirmed by {l.confirmed_by}</span>}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Main surface ────────────────────────────────────────────────────────────

export function UnifiedDetail() {
  const { internal_id } = useParams<{ internal_id: string }>();
  const navigate = useNavigate();
  const [conflictsOpen, setConflictsOpen] = useState(false);

  const { detail } = useUnifiedDetail(internal_id!);

  if (detail.isLoading) {
    return <div className="p-6 text-sm text-ink-muted">Loading opportunity...</div>;
  }

  if (detail.isError) {
    return (
      <div className="py-6">
        <ErrorState
          title="Failed to load opportunity"
          description={detail.error instanceof Error ? detail.error.message : 'Unknown error'}
          onRetry={detail.refetch}
        />
      </div>
    );
  }

  const opp: UnifiedOpportunityDetail | undefined = detail.data;
  if (!opp) return null;

  const title = (opp.merged_fields.title?.value as string | null) ?? opp.internal_id;
  const distinctSources = Array.from(new Set(opp.lineage.map((l) => l.source)));
  const conflictCount = opp.conflicts.length;
  const conflictFields = new Set(opp.conflicts.map((c) => c.field));

  return (
    <div className="flex flex-col gap-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="secondary" size="sm" onClick={() => navigate('/opportunities')}>
          ← Back
        </Button>
        <h1 className="text-xl font-semibold text-ink-primary">{title}</h1>
      </div>

      {/* "Say something" surface strip (doc §7.2) */}
      <Card padding="md">
        <div className="flex flex-col gap-4">
          {/* Source badges + lifecycle stage */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-[0.04em] text-ink-muted">Sources</span>
              <SourceBadgeStrip sources={distinctSources} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-[0.04em] text-ink-muted">Stage</span>
              <span className="text-sm font-medium text-ink-primary" data-testid="stage-chip">
                {STAGE_LABELS[opp.lifecycle_stage] ?? opp.lifecycle_stage}
              </span>
            </div>
          </div>

          {/* Lineage trail */}
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-[0.04em] text-ink-muted">Lifecycle</span>
            <LineageTrail currentStage={opp.lifecycle_stage} />
          </div>

          {/* Conflict count + last refresh */}
          <div className="flex flex-wrap items-center gap-4">
            {conflictCount > 0 ? (
              <button
                type="button"
                className="text-sm font-medium text-warning hover:text-warning-hover transition-colors"
                onClick={() => setConflictsOpen((o) => !o)}
                data-testid="conflict-count-toggle"
              >
                {conflictCount} {conflictCount === 1 ? 'field conflict' : 'field conflicts'} across
                sources {conflictsOpen ? '▲' : '▼'}
              </button>
            ) : (
              <span className="text-sm text-ink-muted">No field conflicts</span>
            )}
            <span className="text-xs text-ink-dim">Updated {relativeTime(opp.updated_at)}</span>
            {opp.primary_source && (
              <span className="text-xs text-ink-dim">Primary: {opp.primary_source}</span>
            )}
          </div>

          {conflictsOpen && conflictCount > 0 && (
            <div className="pt-2 border-t border-border" data-testid="conflict-drawer">
              <ConflictList conflicts={opp.conflicts} />
            </div>
          )}
        </div>
      </Card>

      {/* Merged fields with provenance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card padding="md">
          <h2 className="text-md font-medium text-ink-primary mb-2">Merged Fields</h2>
          <div className="flex flex-col">
            {FIELD_LABELS.map(({ key, label }) => (
              <MergedFieldRow
                key={key}
                label={label}
                fieldKey={key}
                field={opp.merged_fields[key]}
                inConflict={conflictFields.has(key)}
              />
            ))}
          </div>
        </Card>

        {/* Lineage */}
        <Card padding="md">
          <h2 className="text-md font-medium text-ink-primary mb-2">Source Lineage</h2>
          <LineageTable lineage={opp.lineage} />
        </Card>
      </div>
    </div>
  );
}
