import type { DataTableProps } from '../../types';

export function DataTable<T>({
  columns,
  data,
  sortKey,
  sortDir,
  onSort,
  selectable = false,
  selectedIds,
  onSelect,
  onRowClick,
  emptyState,
  loading = false,
  stickyHeader = true,
  rowKey,
}: DataTableProps<T>) {
  if (loading) {
    return <div className="p-6 text-sm text-ink-muted">Loading…</div>;
  }

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const toggleRow = (id: string) => {
    if (!onSelect || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelect(next);
  };

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse" role="grid">
        <thead>
          <tr>
            {selectable && <th className="w-8" />}
            {columns.map((col) => (
              <th
                key={col.key}
                className={`text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold px-2 py-2 text-left border-b border-border ${stickyHeader ? 'sticky top-0 z-10 bg-surface' : ''} ${col.align === 'right' ? 'text-right' : ''} ${col.sortable ? 'cursor-pointer select-none' : ''}`}
                style={col.width ? { width: typeof col.width === 'number' ? `${col.width}px` : col.width } : undefined}
                onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
                role="columnheader"
                aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
              >
                {col.header}
                {sortKey === col.key && <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const id = rowKey(row);
            const selected = selectedIds?.has(id);
            return (
              <tr
                key={id}
                className={`border-b border-border h-10 ${onRowClick ? 'cursor-pointer hover:bg-surface-raised' : ''} ${selected ? 'bg-accent/[0.08]' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {selectable && (
                  <td className="px-2">
                    <input
                      type="checkbox"
                      checked={selected || false}
                      onChange={() => toggleRow(id)}
                      aria-label={`Select row ${id}`}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-2 py-1.5 text-sm text-ink-primary ${col.align === 'right' ? 'text-right font-[var(--font-numeric)]' : ''}`}
                    data-numeric={col.align === 'right' ? '' : undefined}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
