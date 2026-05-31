import { Button } from '../../components/Button/Button';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { useAwardsList } from './hooks/useAwardsList';
import { AwardsList } from './AwardsList';

const CONTRACT_TYPE_OPTIONS = ['Definitive Contract', 'BPA Call', 'Purchase Order', 'Delivery Order'];

export function AwardsSurface() {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    filters,
    setFilter,
    goToPage,
  } = useAwardsList();

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="awards-surface">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-primary">Awards</h1>
      </div>

      <div className="flex flex-wrap gap-3 items-end" data-testid="awards-filter-bar">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-muted">Agency</label>
          <input
            type="text"
            className="h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary w-40"
            placeholder="Filter agency..."
            value={filters.agency ?? ''}
            onChange={(e) => setFilter('agency', e.target.value || undefined)}
            data-testid="filter-agency"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-muted">Contract Type</label>
          <select
            className="h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary"
            value={filters.contract_type ?? ''}
            onChange={(e) => setFilter('contract_type', e.target.value || undefined)}
            data-testid="filter-contract-type"
          >
            <option value="">All</option>
            {CONTRACT_TYPE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-muted">Awarded After</label>
          <input
            type="date"
            className="h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary"
            value={filters.awarded_after ?? ''}
            onChange={(e) => setFilter('awarded_after', e.target.value || undefined)}
            data-testid="filter-awarded-after"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-muted">Awarded Before</label>
          <input
            type="date"
            className="h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary"
            value={filters.awarded_before ?? ''}
            onChange={(e) => setFilter('awarded_before', e.target.value || undefined)}
            data-testid="filter-awarded-before"
          />
        </div>
      </div>

      {isError && (
        <ErrorState
          title="Failed to load awards"
          {...(error?.message ? { description: error.message } : {})}
          onRetry={() => void refetch()}
        />
      )}

      <AwardsList items={data?.items ?? []} loading={isLoading} />

      {data && (
        <div className="flex items-center justify-between border-t border-border pt-4" data-testid="pagination">
          <span className="text-xs text-ink-muted">
            Showing {data.items.length} {data.next_cursor ? '(more available)' : 'total'}
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
              onClick={() => goToPage(data.next_cursor)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
