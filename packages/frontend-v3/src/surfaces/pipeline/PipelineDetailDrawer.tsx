import { Inspector } from '../../components/Inspector/Inspector';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { Field } from '../../components/Field/Field';
import { StageChip } from './components/StageChip';
import { TeamingChip } from './components/TeamingChip';
import { PwinChip } from './components/PwinChip';
import { SourceLink } from './components/SourceLink';
import { StageSelector } from './StageSelector';
import { TeamingEditor } from './TeamingEditor';
import { usePipelineDetail } from './hooks/usePipelineDetail';
import type { PipelineStage, TeamingRole, PipelinePartner, StageHistoryEntry } from './types';
import { STAGE_LABELS } from './types';

interface PipelineDetailDrawerProps {
  selectedId: string | null;
  onClose: () => void;
  onAdvance: (id: string, stage: PipelineStage) => void;
  onSaveTeaming: (
    id: string,
    teaming: TeamingRole,
    partners: PipelinePartner[],
  ) => void;
  advancingId?: string | undefined;
  savingTeaming?: boolean | undefined;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

export function PipelineDetailDrawer({
  selectedId,
  onClose,
  onAdvance,
  onSaveTeaming,
  advancingId,
  savingTeaming = false,
}: PipelineDetailDrawerProps) {
  const { data, isLoading } = usePipelineDetail(selectedId);
  const row = data?.data;

  return (
    <Inspector
      open={selectedId !== null}
      onClose={onClose}
      title={row?.title ?? 'Pipeline Detail'}
    >
      {isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton lines={3} />
        </div>
      )}

      {row && (
        <div className="flex flex-col gap-6" data-testid="pipeline-detail">
          <section className="flex flex-col gap-3">
            <h4 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">
              Metadata
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Agency" value={row.agency} sourceUrl={row.source_url ?? ''} />
              {row.naics && (
                <Field label="NAICS" value={row.naics} sourceUrl={row.source_url ?? ''} />
              )}
              <Field label="Response Date" value={formatDate(row.response_date)} sourceUrl={row.source_url ?? ''} />
              <Field label="Last Updated" value={formatDate(row.updated_at)} sourceUrl={row.source_url ?? ''} />
            </div>
            {row.source_url && (
              <SourceLink url={row.source_url} label="Source" />
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h4 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">
              Stage & Pwin
            </h4>
            <div className="flex items-center gap-2">
              <StageChip stage={row.stage} />
              <PwinChip pwin={row.pwin} sourceUrl={row.pwin_source_url} />
              <TeamingChip teaming={row.teaming} />
            </div>
            <StageSelector
              currentStage={row.stage}
              onAdvance={(s) => onAdvance(row.id, s)}
              disabled={advancingId === row.id}
            />
          </section>

          {row.linked_opportunity_id && (
            <section className="flex flex-col gap-1">
              <h4 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">
                Linked Opportunity
              </h4>
              <a
                href={`/unified`}
                className="text-sm text-accent hover:underline"
              >
                View Opportunity
              </a>
            </section>
          )}

          {row.linked_capture_id && (
            <section className="flex flex-col gap-1">
              <h4 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">
                Linked Capture
              </h4>
              <a
                href={`/capture/${row.linked_capture_id}`}
                className="text-sm text-accent hover:underline"
              >
                View Capture
              </a>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h4 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">
              Stage History
            </h4>
            {row.stage_history.length === 0 && (
              <p className="text-sm text-ink-dim">No stage history recorded.</p>
            )}
            <div className="flex flex-col gap-1">
              {row.stage_history.map((entry: StageHistoryEntry, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm border-b border-border py-1"
                  data-testid="stage-history-entry"
                >
                  <span className="text-ink-primary">
                    {STAGE_LABELS[entry.stage]}
                  </span>
                  <span className="text-ink-muted text-xs">
                    {new Date(entry.changed_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      timeZone: 'America/New_York',
                    })}
                    {entry.source_url && (
                      <>
                        {' '}
                        <a
                          href={entry.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ink-muted hover:text-accent"
                          data-source-url={entry.source_url}
                        >
                          →
                        </a>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h4 className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold mb-2">
              Teaming
            </h4>
            <TeamingEditor
              teaming={row.teaming}
              partners={row.partners}
              onSave={(t, p) => onSaveTeaming(row.id, t, p)}
              disabled={savingTeaming}
            />
          </section>
        </div>
      )}
    </Inspector>
  );
}
