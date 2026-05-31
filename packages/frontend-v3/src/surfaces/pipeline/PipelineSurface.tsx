import { useState, useCallback } from 'react';
import { Tabs } from '../../components/Tabs/Tabs';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { PipelineBoard } from './PipelineBoard';
import { PipelineList } from './PipelineList';
import { PipelineDetailDrawer } from './PipelineDetailDrawer';
import { usePipelineList } from './hooks/usePipelineList';
import { useAdvanceStage } from './hooks/useAdvanceStage';
import { useUpdateTeaming } from './hooks/useUpdateTeaming';
import type {
  PipelineRow,
  PipelineStage,
  TeamingRole,
  PipelinePartner,
  PipelineListParams,
} from './types';
import { PIPELINE_STAGES, STAGE_LABELS, TEAMING_LABELS } from './types';

type ViewMode = 'board' | 'list';

const VIEW_TABS = [
  { id: 'board' as const, label: 'Board' },
  { id: 'list' as const, label: 'List' },
];

const PAGE_SIZE = 50;

export function PipelineSurface() {
  const [view, setView] = useState<ViewMode>('board');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [sortKey, setSortKey] = useState<string>('response_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [stageFilter, setStageFilter] = useState<PipelineStage[]>([]);
  const [teamingFilter, setTeamingFilter] = useState<TeamingRole[]>([]);
  const [agencyFilter, setAgencyFilter] = useState('');
  const [naicsFilter, setNaicsFilter] = useState('');

  const filter: PipelineListParams['filter'] = {};
  if (stageFilter.length > 0) filter.stage = stageFilter;
  if (teamingFilter.length > 0) filter.teaming = teamingFilter;
  if (agencyFilter) filter.agency = agencyFilter;
  if (naicsFilter) filter.naics = naicsFilter;

  const params: PipelineListParams = {
    limit: PAGE_SIZE,
    offset,
    sort: `${sortKey}:${sortDir}`,
    filter,
  };

  const { data, isLoading, isError, error, refetch, invalidate } =
    usePipelineList(params);

  const advanceMutation = useAdvanceStage();
  const teamingMutation = useUpdateTeaming();

  const handleSort = useCallback(
    (key: string) => {
      if (key === sortKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey],
  );

  const handleAdvance = useCallback(
    (id: string, stage: PipelineStage) => {
      advanceMutation.mutate({ id, stage });
    },
    [advanceMutation],
  );

  const handleSaveTeaming = useCallback(
    (id: string, teaming: TeamingRole, partners: PipelinePartner[]) => {
      teamingMutation.mutate({ id, teaming, partners });
    },
    [teamingMutation],
  );

  const handleRowClick = useCallback((row: PipelineRow) => {
    setSelectedId(row.id);
  }, []);

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  const toggleStageFilter = (s: PipelineStage) => {
    setStageFilter((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
    setOffset(0);
  };

  const toggleTeamingFilter = (t: TeamingRole) => {
    setTeamingFilter((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
    setOffset(0);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-primary">Pipeline</h1>
        <Tabs
          items={VIEW_TABS}
          activeId={view}
          onChange={(id) => setView(id as ViewMode)}
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center" data-testid="pipeline-filters">
        <div className="flex flex-wrap gap-1">
          {PIPELINE_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              className={`h-7 px-2 rounded-sm border text-xs font-medium transition-colors ${
                stageFilter.includes(s)
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border bg-surface text-ink-muted hover:bg-surface-raised'
              }`}
              onClick={() => toggleStageFilter(s)}
            >
              {STAGE_LABELS[s]}
            </button>
          ))}
        </div>

        <span className="text-ink-dim text-xs">|</span>

        <div className="flex flex-wrap gap-1">
          {(['prime', 'sub', 'self-perform', 'undecided'] as TeamingRole[]).map(
            (t) => (
              <button
                key={t}
                type="button"
                className={`h-7 px-2 rounded-sm border text-xs font-medium transition-colors ${
                  teamingFilter.includes(t)
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border bg-surface text-ink-muted hover:bg-surface-raised'
                }`}
                onClick={() => toggleTeamingFilter(t)}
              >
                {TEAMING_LABELS[t]}
              </button>
            ),
          )}
        </div>

        <input
          type="text"
          placeholder="Agency"
          value={agencyFilter}
          onChange={(e) => {
            setAgencyFilter(e.target.value);
            setOffset(0);
          }}
          className="h-7 w-32 rounded-sm border border-border bg-surface px-2 text-xs text-ink-primary placeholder:text-ink-dim"
        />
        <input
          type="text"
          placeholder="NAICS"
          value={naicsFilter}
          onChange={(e) => {
            setNaicsFilter(e.target.value);
            setOffset(0);
          }}
          className="h-7 w-24 rounded-sm border border-border bg-surface px-2 text-xs text-ink-primary placeholder:text-ink-dim"
        />
      </div>

      {isLoading && <Skeleton lines={6} />}

      {isError && (
        <ErrorState
          title="Failed to load pipeline"
          description={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => {
            invalidate();
            refetch();
          }}
        />
      )}

      {!isLoading && !isError && view === 'board' && (
        <PipelineBoard
          rows={rows}
          onAdvance={handleAdvance}
          onRowClick={handleRowClick}
          advancingId={advanceMutation.isPending ? advanceMutation.variables?.id : undefined}
        />
      )}

      {!isLoading && !isError && view === 'list' && (
        <>
          <PipelineList
            rows={rows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onRowClick={handleRowClick}
            onAdvance={handleAdvance}
            advancingId={advanceMutation.isPending ? advanceMutation.variables?.id : undefined}
          />

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-ink-muted">
                {offset + 1}&ndash;{Math.min(offset + PAGE_SIZE, total)} of{' '}
                {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="h-7 px-3 rounded-sm border border-border text-xs text-ink-primary hover:bg-surface-raised disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="h-7 px-3 rounded-sm border border-border text-xs text-ink-primary hover:bg-surface-raised disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <PipelineDetailDrawer
        selectedId={selectedId}
        onClose={() => setSelectedId(null)}
        onAdvance={handleAdvance}
        onSaveTeaming={handleSaveTeaming}
        advancingId={advanceMutation.isPending ? advanceMutation.variables?.id : undefined}
        savingTeaming={teamingMutation.isPending}
      />
    </div>
  );
}
