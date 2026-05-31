import { DataTable } from '../../components/DataTable/DataTable';
import { Button } from '../../components/Button/Button';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { SourceLink } from './components/SourceLink';
import { useRegulatoryList } from './hooks/useRegulatoryList';
import type { TableColumn } from '../../types';
import type { RegulatoryNotice } from './types';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

const columns: TableColumn<RegulatoryNotice>[] = [
  {
    key: 'document_number',
    header: 'Document #',
    width: 140,
    render: (row) => (
      <SourceLink
        href={row.html_url}
        label={row.document_number}
        data-testid="source-link-doc-number"
      />
    ),
  },
  {
    key: 'title',
    header: 'Title',
    render: (row) => (
      <SourceLink
        href={row.html_url}
        label={row.title}
        data-testid="source-link-title"
      />
    ),
  },
  {
    key: 'agency_names',
    header: 'Agencies',
    width: 200,
    render: (row) => (
      <span className="text-ink-primary">{row.agency_names.join(', ') || '—'}</span>
    ),
  },
  {
    key: 'publication_date',
    header: 'Publication Date',
    width: 140,
    render: (row) => (
      <span className="text-ink-primary">{formatDate(row.publication_date)}</span>
    ),
  },
  {
    key: 'source',
    header: 'Source',
    width: 120,
    render: (row) => (
      <span className="flex items-center gap-2">
        <SourceLink
          href={row.html_url}
          label="HTML"
          data-testid="source-link-html"
        />
        {row.pdf_url && (
          <SourceLink
            href={row.pdf_url}
            label="PDF"
            secondary
            data-testid="source-link-pdf"
          />
        )}
      </span>
    ),
  },
];

export function RegulatoryList() {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    filters,
    goToPage,
  } = useRegulatoryList();

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="regulatory-list">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-primary">Regulatory Notices</h1>
      </div>

      {isError && (
        <ErrorState
          title="Failed to load regulatory notices"
          {...(error?.message ? { description: error.message } : {})}
          onRetry={() => void refetch()}
        />
      )}

      <DataTable<RegulatoryNotice>
        columns={columns}
        data={data?.items ?? []}
        loading={isLoading}
        rowKey={(row) => String(row.id)}
        emptyState={
          <EmptyState
            title="No regulatory notices found"
            description="Federal Register notices will appear here once ingested."
          />
        }
      />

      {data && (data.next_cursor || filters.cursor) && (
        <div className="flex items-center justify-between border-t border-border pt-4" data-testid="pagination">
          <span className="text-xs text-ink-muted">
            Showing {data.items.length} {data.next_cursor ? 'of more' : 'total'}
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
              disabled={!data.next_cursor}
              onClick={() => data.next_cursor && goToPage(data.next_cursor)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
