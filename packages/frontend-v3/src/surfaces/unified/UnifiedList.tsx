import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../components/DataTable/DataTable';
import { Button } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { Tabs } from '../../components/Tabs/Tabs';
import { StageChip } from './components/StageChip';
import { SourceLink } from '../opportunities/components/SourceLink';
import { useUnifiedList, UNIFIED_TABS } from './hooks/useUnifiedList';
import { formatDate, formatValueCents, dueCountdownLabel } from './format';
import type { TableColumn } from '../../types';
import type { UnifiedListItem } from './types';

/**
 * F-421: tabbed unified opportunities list.
 *
 * Tabs (All / Active / Pipeline / Fast Track / Awarded / Review Matches) are
 * filters on the same GET /v3/opportunities/unified endpoint via the `stage`
 * group token. "Say-something" surfaces sit in the first 200 vertical pixels:
 * a one-line tab summary plus a live count of the current slice, so the user
 * understands what they are looking at within ~10 seconds. Each row leads with
 * the lifecycle stage and a due-date countdown for things you can act on now.
 */

const SUBTITLES: Record<string, string> = {
  all: 'Every opportunity across all stages and sources.',
  active: 'Open solicitations — things you can bid on right now.',
  pipeline: 'Forecasts and pre-solicitations — coming soon.',
  fast_track: 'Early signals — leading indicators on the horizon.',
  awarded: 'Awarded and post-award — the closed loop.',
  review: 'Human-in-the-loop match suggestions.',
};

const columns: TableColumn<UnifiedListItem>[] = [
  {
    key: 'lifecycle_stage',
    header: 'Stage',
    width: 130,
    render: (row) => <StageChip stage={row.lifecycle_stage} />,
  },
  {
    key: 'title',
    header: 'Title',
    render: (row) => (
      <SourceLink
        value={row.title ?? '—'}
        sources={row.sources}
        data-testid={`row-title-${row.internal_id}`}
      />
    ),
  },
  {
    key: 'agency',
    header: 'Agency',
    width: 160,
    render: (row) => (
      <SourceLink
        value={<span className="text-ink-muted">{row.agency ?? '—'}</span>}
        sources={row.sources}
        data-testid={`row-agency-${row.internal_id}`}
      />
    ),
  },
  {
    key: 'estimated_value_cents',
    header: 'Est. Value',
    width: 110,
    align: 'right',
    render: (row) => (
      <SourceLink
        value={<span data-numeric>{formatValueCents(row.estimated_value_cents)}</span>}
        sources={row.sources}
        data-testid={`row-value-${row.internal_id}`}
      />
    ),
  },
  {
    key: 'response_due_at',
    header: 'Response Due',
    width: 150,
    render: (row) => {
      const countdown =
        row.lifecycle_stage === 'solicitation'
          ? dueCountdownLabel(row.response_due_at)
          : null;
      return (
        <div className="flex flex-col">
          <SourceLink
            value={formatDate(row.response_due_at)}
            sources={row.sources}
            data-testid={`row-due-${row.internal_id}`}
          />
          {countdown && (
            <span className="text-xs text-critical font-medium" data-testid={`due-countdown-${row.internal_id}`}>
              {countdown}
            </span>
          )}
        </div>
      );
    },
  },
];

export function UnifiedList() {
  const navigate = useNavigate();
  const {
    tab,
    isListTab,
    filters,
    items,
    pagination,
    isLoading,
    isError,
    error,
    refetch,
    setTab,
    goToCursor,
  } = useUnifiedList();

  const tabItems = UNIFIED_TABS.map((t) => ({
    id: t.id,
    label: t.label,
    // Review Matches has no list endpoint until F-422; show it disabled.
    ...(t.isList ? {} : { disabled: true }),
  }));

  const subtitle = SUBTITLES[tab] ?? '';

  return (
    <div className="flex flex-col gap-5 p-6" data-testid="unified-list">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-primary">Opportunities</h1>
      </div>

      <Tabs items={tabItems} activeId={tab} onChange={(id) => setTab(id as typeof tab)} />

      {/* Say-something surface: one-line context + live count of this slice. */}
      <div className="flex items-baseline justify-between" data-testid="tab-summary">
        <p className="text-sm text-ink-muted">{subtitle}</p>
        {isListTab && !isLoading && !isError && (
          <span className="text-sm text-ink-muted" data-testid="tab-count">
            <span className="text-ink-primary font-semibold" data-numeric>
              {items.length}
            </span>
            {pagination?.hasMore ? '+ ' : ' '}
            shown
          </span>
        )}
      </div>

      {!isListTab && (
        <EmptyState
          title="Review Matches is coming next"
          description="The match-suggestion review queue ships in F-422. For now, browse opportunities in the other tabs."
        />
      )}

      {isListTab && (
        <>
          {isError && (
            <ErrorState
              title="Failed to load opportunities"
              {...(error?.message ? { description: error.message } : {})}
              onRetry={() => void refetch()}
            />
          )}

          {!isError && (
            <DataTable<UnifiedListItem>
              columns={columns}
              data={items}
              loading={isLoading}
              onRowClick={(row) => navigate(`/unified/${row.internal_id}`)}
              rowKey={(row) => row.internal_id}
              emptyState={
                <EmptyState
                  title="No opportunities in this view"
                  description="Try a different tab or adjust your filters."
                />
              }
            />
          )}

          {pagination && items.length > 0 && (
            <div
              className="flex items-center justify-between border-t border-border pt-4"
              data-testid="pagination"
            >
              <span className="text-xs text-ink-muted">
                Showing {items.length}
                {pagination.hasMore ? ' of more' : ''}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!filters.cursor}
                  onClick={() => goToCursor(null)}
                >
                  First
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!pagination.hasMore}
                  onClick={() => goToCursor(pagination.cursor)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
