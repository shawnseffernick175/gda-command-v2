import { TeamingChip } from './components/TeamingChip';
import { PwinChip } from './components/PwinChip';
import { StageSelector } from './StageSelector';
import { SourceLink } from './components/SourceLink';
import type { PipelineRow, PipelineStage } from './types';
import { PIPELINE_STAGES, STAGE_LABELS } from './types';

interface PipelineBoardProps {
  rows: PipelineRow[];
  onAdvance: (id: string, stage: PipelineStage) => void;
  onRowClick: (row: PipelineRow) => void;
  advancingId?: string | undefined;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

export function PipelineBoard({
  rows,
  onAdvance,
  onRowClick,
  advancingId,
}: PipelineBoardProps) {
  const byStage = PIPELINE_STAGES.reduce(
    (acc, s) => {
      acc[s] = rows.filter((r) => r.stage === s);
      return acc;
    },
    {} as Record<PipelineStage, PipelineRow[]>,
  );

  return (
    <div
      className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]"
      data-testid="pipeline-board"
    >
      {PIPELINE_STAGES.map((stage) => (
        <div
          key={stage}
          className="flex flex-col min-w-[220px] w-[220px] shrink-0"
          data-testid={`board-column-${stage}`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">
              {STAGE_LABELS[stage]}
            </span>
            <span className="text-xs text-ink-dim">
              {byStage[stage]?.length ?? 0}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {byStage[stage]?.map((row) => (
              <div
                key={row.id}
                className="rounded-sm border border-border bg-surface p-3 cursor-pointer hover:bg-surface-raised transition-colors"
                onClick={() => onRowClick(row)}
                data-testid="pipeline-card"
              >
                <div className="text-sm font-medium text-ink-primary mb-1 line-clamp-2">
                  {row.title}
                </div>
                <div className="text-xs text-ink-muted mb-2" data-source-url={row.source_url}>{row.agency}</div>
                <div className="text-xs text-ink-dim mb-2" data-source-url={row.source_url}>
                  Response: {formatDate(row.response_date)}
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  <PwinChip pwin={row.pwin} sourceUrl={row.pwin_source_url} />
                  <TeamingChip teaming={row.teaming} />
                </div>
                {row.source_url && (
                  <div className="mb-2">
                    <SourceLink url={row.source_url} />
                  </div>
                )}
                <div onClick={(e) => e.stopPropagation()}>
                  <StageSelector
                    currentStage={row.stage}
                    onAdvance={(s) => onAdvance(row.id, s)}
                    disabled={advancingId === row.id}
                  />
                </div>
              </div>
            ))}
            {(!byStage[stage] || byStage[stage]?.length === 0) && (
              <div className="text-xs text-ink-dim text-center py-6">
                No items
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
