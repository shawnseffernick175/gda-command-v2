import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DataTable } from '../../components/DataTable/DataTable';
import { Button } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { useOpportunitiesList } from './hooks/useOpportunitiesList';
import { GradeChip } from './components/GradeChip';
import { StatusChip } from './components/StatusChip';
import { SourceLink } from './components/SourceLink';
import { FilterBar } from './components/FilterBar';
import { OpportunityDetailPanel } from './OpportunityDetail';
import { OpportunityCreateDrawer } from './OpportunityCreateDrawer';
import type { TableColumn } from '../../types';
import type { OpportunitySummary } from './types';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

const columns: TableColumn<OpportunitySummary>[] = [
  {
    key: 'title',
    header: 'Title',
    sortable: true,
    render: (row) => (
      <SourceLink value={row.title} sources={row.title_sources} data-testid="source-link-title" />
    ),
  },
  {
    key: 'agency',
    header: 'Agency',
    sortable: true,
    width: 140,
    render: (row) => (
      <SourceLink value={row.agency ?? '—'} sources={row.agency_sources} data-testid="source-link-agency" />
    ),
  },
  {
    key: 'naics',
    header: 'NAICS',
    sortable: true,
    width: 100,
    render: (row) => (
      <SourceLink value={row.naics ?? '—'} sources={row.naics_sources} data-testid="source-link-naics" />
    ),
  },
  {
    key: 'set_aside',
    header: 'Set-Aside',
    sortable: true,
    width: 140,
    render: (row) => (
      <SourceLink value={row.set_aside ?? '—'} sources={row.set_aside_sources} data-testid="source-link-set-aside" />
    ),
  },
  {
    key: 'response_due_at',
    header: 'Response Due',
    sortable: true,
    width: 120,
    render: (row) => (
      <SourceLink
        value={formatDate(row.response_due_at)}
        sources={row.response_due_at_sources}
        data-testid="source-link-due-date"
      />
    ),
  },
  {
    key: 'grade',
    header: 'Grade',
    sortable: true,
    width: 70,
    render: (row) => row.grade ? <GradeChip grade={row.grade} sources={row.grade_sources} /> : <span className="text-ink-dim">—</span>,
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    width: 100,
    render: (row) => <StatusChip status={row.status} />,
  },
];

export function OpportunitiesList() {
  const navigate = useNavigate();
  const { notice_id } = useParams<{ notice_id: string }>();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    filters,
    setFilter,
    setSort,
    goToPage,
    sortKey,
    sortDir,
  } = useOpportunitiesList();

  const [createOpen, setCreateOpen] = useState(false);

  if (notice_id) {
    return (
      <OpportunityDetailPanel
        opportunityId={notice_id}
        onBack={() => navigate('/opportunities')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="opportunities-list">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-primary">Opportunities</h1>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          + New
        </Button>
      </div>

      <FilterBar filters={filters} onFilterChange={setFilter} />

      {isError && (
        <ErrorState title="Failed to load opportunities" {...(error?.message ? { description: error.message } : {})} onRetry={() => void refetch()} />
      )}

      <DataTable<OpportunitySummary>
        columns={columns}
        data={data?.items ?? []}
        loading={isLoading}
        {...(sortKey ? { sortKey } : {})}
        {...(sortDir ? { sortDir } : {})}
        onSort={setSort}
        onRowClick={(row) => navigate(`/opp/${row.id}`)}
        rowKey={(row) => row.id}
        emptyState={
          <EmptyState
            title="No opportunities found"
            description="Try adjusting your filters or create a new opportunity."
            action={{ label: '+ New Opportunity', onClick: () => setCreateOpen(true) }}
          />
        }
      />

      {data?.pagination && (
        <div className="flex items-center justify-between border-t border-border pt-4" data-testid="pagination">
          <span className="text-xs text-ink-muted">
            Showing {data.items.length} of {data.pagination.hasMore ? 'more' : data.items.length}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!filters.cursor}
              onClick={() => goToPage(null)}
            >
              First
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!data.pagination.hasMore}
              onClick={() => goToPage(data.pagination.cursor)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <OpportunityCreateDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => navigate(`/opp/${id}`)}
      />
    </div>
  );
}
