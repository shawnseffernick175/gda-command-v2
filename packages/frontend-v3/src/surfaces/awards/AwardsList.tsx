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
      <SourceLink
        value={row.recipient_name ?? '—'}
        sources={row.recipient_name_sources}
        data-testid="source-link-recipient"
      />
    ),
  },
  {
    key: 'agency',
    header: 'Agency',
    width: 180,
    render: (row) => (
      <SourceLink
        value={row.agency ?? '—'}
        sources={row.agency_sources}
        data-testid="source-link-agency"
      />
    ),
  },
  {
    key: 'contract_type',
    header: 'Contract Type',
    width: 130,
    render: (row) => (
      <SourceLink
        value={row.contract_type ?? '—'}
        sources={row.contract_type_sources}
        data-testid="source-link-contract-type"
      />
    ),
  },
  {
    key: 'awarded_amount',
    header: 'Amount',
    width: 130,
    align: 'right',
    render: (row) => (
      <SourceLink
        value={formatCurrency(row.awarded_amount)}
        sources={row.awarded_amount_sources}
        data-testid="source-link-amount"
      />
    ),
  },
  {
    key: 'awarded_at',
    header: 'Awarded Date',
    width: 120,
    render: (row) => (
      <SourceLink
        value={formatDate(row.awarded_at)}
        sources={row.awarded_at_sources}
        data-testid="source-link-date"
      />
    ),
  },
  {
    key: 'source',
    header: 'Source',
    width: 140,
    render: (row) => {
      const url = row.fpds_url;
      if (!url) return <span className="text-ink-muted">—</span>;
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline transition-colors"
          data-testid="source-link-usaspending"
        >
          USAspending.gov
        </a>
      );
    },
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
