import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../components/DataTable/DataTable';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { TextField } from '../../components/TextField/TextField';
import { Button } from '../../components/Button/Button';
import { useCapturesList } from './hooks/useCapturesList';
import { ColorReviewChip } from './components/ColorReviewChip';
import { PwinChip } from './components/PwinChip';
import type { CaptureListItem } from './types';
import type { TableColumn } from '../../types';

const PAGE_SIZE = 25;

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
}

export function CaptureList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState('response_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState('');

  const { data, isLoading, isError, error, refetch } = useCapturesList({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort: sortKey,
    sortDir,
    filter,
  });

  const handleSort = useCallback((key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  }, [sortKey]);

  const columns: TableColumn<CaptureListItem>[] = [
    {
      key: 'opportunity_title',
      header: 'Opportunity',
      sortable: true,
      render: (row) => (
        <span>{row.opportunity_title ?? '\u2014'}</span>
      ),
    },
    {
      key: 'opportunity_agency',
      header: 'Agency',
      sortable: true,
      width: 160,
      render: (row) => <span className="text-ink-muted">{row.opportunity_agency ?? '\u2014'}</span>,
    },
    {
      key: 'response_date',
      header: 'Response Date',
      sortable: true,
      width: 140,
      render: (row) => <span>{formatDate(row.created_at)}</span>,
    },
    {
      key: 'color_stage',
      header: 'Color Review',
      sortable: true,
      width: 110,
      render: (row) => (
        <ColorReviewChip phase={row.color_stage} />
      ),
    },
    {
      key: 'pwin',
      header: 'Pwin',
      sortable: true,
      width: 80,
      render: (row) => <PwinChip pwin={row.pwin ?? 0} />,
    },
    {
      key: 'updated_at',
      header: 'Updated',
      sortable: true,
      width: 140,
      render: (row) => (
        <span className="text-ink-muted">{formatDate(row.updated_at)}</span>
      ),
    },
  ];

  const total = data?.total ?? data?.items?.length ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (isError) {
    return (
      <div className="py-6">
        <h1 className="text-xl font-semibold text-ink-primary mb-6">Capture</h1>
        <ErrorState
          title="Failed to load captures"
          description={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-6">
      <h1 className="text-xl font-semibold text-ink-primary">Capture</h1>

      <div className="flex items-center gap-4">
        <div className="w-72">
          <TextField
            type="search"
            placeholder="Filter captures..."
            value={filter}
            onChange={(v) => { setFilter(v); setPage(0); }}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={(row) => navigate(`/capture/${row.id}`)}
        rowKey={(row) => row.id}
        loading={isLoading}
        emptyState={
          <EmptyState
            title="No captures found"
            description="Qualified opportunities will appear here once they enter the capture phase."
          />
        }
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">
            {page * PAGE_SIZE + 1}\u2013{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
