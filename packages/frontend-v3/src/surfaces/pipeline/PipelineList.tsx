import { DataTable } from '../../components/DataTable/DataTable';
import { StageChip } from './components/StageChip';
import { TeamingChip } from './components/TeamingChip';
import { PwinChip } from './components/PwinChip';
import { SourceLink } from './components/SourceLink';
import { StageSelector } from './StageSelector';
import type { PipelineRow, PipelineStage } from './types';
import type { TableColumn } from '../../types';

interface PipelineListProps {
  rows: PipelineRow[];
  sortKey?: string | undefined;
  sortDir?: 'asc' | 'desc' | undefined;
  onSort?: ((key: string) => void) | undefined;
  onRowClick: (row: PipelineRow) => void;
  onAdvance: (id: string, stage: PipelineStage) => void;
  advancingId?: string | undefined;
  loading?: boolean | undefined;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

export function PipelineList({
  rows,
  sortKey,
  sortDir,
  onSort,
  onRowClick,
  onAdvance,
  advancingId,
  loading = false,
}: PipelineListProps) {
  const columns: TableColumn<PipelineRow>[] = [
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-primary">{row.title}</span>
          {row.source_url && <SourceLink url={row.source_url} />}
        </div>
      ),
    },
    {
      key: 'agency',
      header: 'Agency',
      sortable: true,
      render: (row) => (
        <span className="text-sm text-ink-primary" data-source-url={row.source_url}>{row.agency}</span>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <StageChip stage={row.stage} />
          <StageSelector
            currentStage={row.stage}
            onAdvance={(s) => onAdvance(row.id, s)}
            disabled={advancingId === row.id}
          />
        </div>
      ),
    },
    {
      key: 'teaming',
      header: 'Teaming',
      sortable: true,
      render: (row) => <TeamingChip teaming={row.teaming} />,
    },
    {
      key: 'pwin',
      header: 'Pwin',
      sortable: true,
      align: 'right' as const,
      render: (row) => (
        <PwinChip pwin={row.pwin} sourceUrl={row.pwin_source_url} />
      ),
    },
    {
      key: 'response_date',
      header: 'Response Date',
      sortable: true,
      render: (row) => (
        <span className="text-sm text-ink-primary" data-source-url={row.source_url}>
          {formatDate(row.response_date)}
        </span>
      ),
    },
    {
      key: 'updated_at',
      header: 'Last Updated',
      sortable: true,
      render: (row) => (
        <span className="text-sm text-ink-muted" data-source-url={row.source_url}>
          {formatDate(row.updated_at)}
        </span>
      ),
    },
  ];

  return (
    <div data-testid="pipeline-list">
      <DataTable<PipelineRow>
        columns={columns}
        data={rows}
        {...(sortKey != null ? { sortKey } : {})}
        {...(sortDir != null ? { sortDir } : {})}
        {...(onSort != null ? { onSort } : {})}
        onRowClick={onRowClick}
        rowKey={(r) => r.id}
        {...(loading != null ? { loading } : {})}
        emptyState={
          <div className="text-center py-12 text-sm text-ink-muted">
            No pipeline items match the current filters.
          </div>
        }
      />
    </div>
  );
}
