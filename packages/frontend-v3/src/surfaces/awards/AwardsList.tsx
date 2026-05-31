import { DataTable } from '../../components/DataTable/DataTable';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { SourceLink } from './components/SourceLink';
import type { TableColumn } from '../../types';
import type { AwardItem } from './types';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const columns: TableColumn<AwardItem>[] = [
  {
    key: 'recipient_name',
    header: 'Recipient',
    render: (row) => (
      <span className="text-ink-primary">{row.recipient_name ?? '—'}</span>
    ),
  },
  {
    key: 'agency',
    header: 'Agency',
    width: 180,
    render: (row) => (
      <span className="text-ink-primary">{row.agency ?? '—'}</span>
    ),
  },
  {
    key: 'contract_type',
    header: 'Contract Type',
    width: 130,
    render: (row) => (
      <span className="text-ink-primary">{row.contract_type ?? '—'}</span>
    ),
  },
  {
    key: 'awarded_amount',
    header: 'Amount',
    width: 130,
    align: 'right',
    render: (row) => (
      <span>{formatCurrency(row.awarded_amount)}</span>
    ),
  },
  {
    key: 'awarded_at',
    header: 'Awarded Date',
    width: 120,
    render: (row) => (
      <span className="text-ink-primary">{formatDate(row.awarded_at)}</span>
    ),
  },
  {
    key: 'source',
    header: 'Source',
    width: 140,
    render: (row) => <SourceLink url={row.fpds_url} />,
  },
];

interface AwardsListProps {
  items: AwardItem[];
  loading: boolean;
}

export function AwardsList({ items, loading }: AwardsListProps) {
  return (
    <DataTable<AwardItem>
      columns={columns}
      data={items}
      loading={loading}
      rowKey={(row) => row.id}
      emptyState={
        <EmptyState
          title="No awards found"
          description="Try adjusting your filters."
        />
      }
    />
  );
}
