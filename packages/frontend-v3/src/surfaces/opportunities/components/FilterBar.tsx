import type { ListFilters } from '../types';

interface FilterBarProps {
  filters: ListFilters;
  onFilterChange: (key: keyof ListFilters, value: string | undefined) => void;
}

const STATUS_OPTIONS = ['qualified', 'watching', 'skipped', 'unscored'];
const SET_ASIDE_OPTIONS = ['Total Small Business', 'HUBZone', '8(a)', 'WOSB', 'SDVOSB', 'None'];

export function FilterBar({ filters, onFilterChange }: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-3 items-end" data-testid="filter-bar">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-ink-muted">Status</label>
        <select
          className="h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary"
          value={filters.status ?? ''}
          onChange={(e) => onFilterChange('status', e.target.value || undefined)}
          data-testid="filter-status"
        >
          <option value="">All</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-ink-muted">Agency</label>
        <input
          type="text"
          className="h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary w-40"
          placeholder="Filter agency…"
          value={filters.agency ?? ''}
          onChange={(e) => onFilterChange('agency', e.target.value || undefined)}
          data-testid="filter-agency"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-ink-muted">NAICS</label>
        <input
          type="text"
          className="h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary w-32"
          placeholder="NAICS code…"
          value={filters.naics ?? ''}
          onChange={(e) => onFilterChange('naics', e.target.value || undefined)}
          data-testid="filter-naics"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-ink-muted">Set-Aside</label>
        <select
          className="h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary"
          value={filters.set_aside ?? ''}
          onChange={(e) => onFilterChange('set_aside', e.target.value || undefined)}
          data-testid="filter-set-aside"
        >
          <option value="">All</option>
          {SET_ASIDE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-ink-muted">Due After</label>
        <input
          type="date"
          className="h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary"
          value={filters.due_after ?? ''}
          onChange={(e) => onFilterChange('due_after', e.target.value || undefined)}
          data-testid="filter-due-after"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-ink-muted">Due Before</label>
        <input
          type="date"
          className="h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary"
          value={filters.due_before ?? ''}
          onChange={(e) => onFilterChange('due_before', e.target.value || undefined)}
          data-testid="filter-due-before"
        />
      </div>
    </div>
  );
}
