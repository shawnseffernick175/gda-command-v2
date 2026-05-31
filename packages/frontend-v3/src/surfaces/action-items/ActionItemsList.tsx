import { useState, useMemo } from 'react';
import { DataTable, Button, EmptyState, ErrorState, Select, SourceUrlChip } from '../../components';
import type { TableColumn } from '../../types';
import type { ActionItem, ActionItemStatus, ActionItemFilters, SortField, SortDir } from './types';
import { StatusChip } from './components/StatusChip';
import { SourceChip } from './components/SourceChip';
import { SourceLink } from './components/SourceLink';
import { ActionItemDetailDrawer } from './ActionItemDetailDrawer';
import { ActionItemCreateDrawer } from './ActionItemCreateDrawer';
import { useActionItemsList } from './hooks/useActionItemsList';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

const SOURCE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Sources' },
  { value: 'email', label: 'Email' },
  { value: 'capture', label: 'Capture' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'system', label: 'System' },
  { value: 'manual', label: 'Manual' },
  { value: 'sentinel', label: 'Sentinel' },
  { value: 'n8n', label: 'n8n Cron' },
];

function sortItems(items: ActionItem[], field: SortField, dir: SortDir): ActionItem[] {
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'due_date': {
        const aDate = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bDate = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        cmp = aDate - bDate;
        break;
      }
      case 'created_at':
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
      case 'status': {
        const order: Record<ActionItemStatus, number> = { open: 0, in_progress: 1, done: 2 };
        cmp = order[a.status] - order[b.status];
        break;
      }
      case 'source':
        cmp = a.source.localeCompare(b.source);
        break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

export function ActionItemsList() {
  const [filters, setFilters] = useState<ActionItemFilters>({});
  const [sortField, setSortField] = useState<SortField>('due_date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [cursor, setCursor] = useState<string | undefined>();
  const [prevCursors, setPrevCursors] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<ActionItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError, error } = useActionItemsList(filters, 50, cursor);

  const handleSort = (key: string) => {
    const field = key as SortField;
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleNextPage = () => {
    if (data?.pagination.cursor) {
      setPrevCursors((prev) => [...prev, cursor ?? '']);
      setCursor(data.pagination.cursor);
    }
  };

  const handlePrevPage = () => {
    const prev = [...prevCursors];
    const last = prev.pop();
    setPrevCursors(prev);
    setCursor(last || undefined);
  };

  const sorted = useMemo(
    () => (data?.items ? sortItems(data.items, sortField, sortDir) : []),
    [data?.items, sortField, sortDir],
  );

  const columns: TableColumn<ActionItem>[] = [
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-1">
          <span className="text-sm text-ink-primary font-medium">{row.title}</span>
          {row.title_sources.length > 0 && (
            <SourceUrlChip
              url={row.title_sources[0]!.url}
              source_kind={row.title_sources[0]!.kind as 'sam_gov' | 'fpds' | 'usaspending' | 'govwin' | 'news' | 'doctrine' | 'partner_site' | 'internal'}
              retrieved_at={row.title_sources[0]!.retrieved_at}
            />
          )}
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      width: 100,
      render: (row) => (
        <div className="flex items-center gap-1">
          <SourceChip source={row.source} />
          <SourceLink linkedRecordType={row.linked_record_type} linkedRecordId={row.linked_record_id} source={row.source} />
        </div>
      ),
    },
    {
      key: 'due_date',
      header: 'Due',
      sortable: true,
      width: 110,
      render: (row) => <span className="text-sm text-ink-primary">{formatDate(row.due_date)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: 120,
      render: (row) => <StatusChip status={row.status} />,
    },
    {
      key: 'owner',
      header: 'Assigned',
      width: 100,
      render: (row) => <span className="text-sm text-ink-muted">{row.owner}</span>,
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      width: 110,
      render: (row) => <span className="text-sm text-ink-muted">{formatDate(row.created_at)}</span>,
    },
  ];

  if (isError) {
    const errObj = error instanceof Error ? error : new Error('Unknown error');
    return <ErrorState error={errObj} />;
  }

  return (
    <div className="flex flex-col gap-4 p-6" data-testid="action-items-surface">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-primary">Action Items</h1>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>+ New</Button>
      </div>

      <div className="flex gap-3">
        <Select
          options={STATUS_FILTER_OPTIONS}
          value={filters.status ?? ''}
          onChange={(v) => { setFilters((f) => { const next = { ...f }; if (v) { next.status = v; } else { delete next.status; } return next; }); setCursor(undefined); }}
          placeholder="Status"
        />
        <Select
          options={SOURCE_FILTER_OPTIONS}
          value={filters.source ?? ''}
          onChange={(v) => { setFilters((f) => { const next = { ...f }; if (v) { next.source = v; } else { delete next.source; } return next; }); setCursor(undefined); }}
          placeholder="Source"
        />
      </div>

      <DataTable<ActionItem>
        columns={columns}
        data={sorted}
        sortKey={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={(row) => setSelectedItem(row)}
        rowKey={(row) => row.id}
        loading={isLoading}
        emptyState={<EmptyState title="No action items" description="Create a new action item to get started." />}
      />

      {data?.pagination && (
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>{sorted.length} item{sorted.length !== 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={prevCursors.length === 0}
              onClick={handlePrevPage}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!data.pagination.hasMore}
              onClick={handleNextPage}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <ActionItemDetailDrawer
        key={selectedItem?.id}
        item={selectedItem}
        open={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
      />

      <ActionItemCreateDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}
