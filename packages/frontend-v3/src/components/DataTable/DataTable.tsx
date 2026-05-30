import { type ReactNode } from "react";

export interface TableColumn<T> {
  key: string;
  header: string;
  width?: number | string;
  sortable?: boolean;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (ids: Set<string>) => void;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  loading?: boolean;
  stickyHeader?: boolean;
  rowKey: (row: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  sortKey,
  sortDir,
  onSort,
  onRowClick,
  emptyState,
  loading,
  stickyHeader = true,
  rowKey,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-ink-muted text-sm">
        Loading...
      </div>
    );
  }

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse" role="grid">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                role="columnheader"
                aria-sort={
                  sortKey === col.key
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
                className={[
                  "text-xs text-ink-muted uppercase tracking-wider font-semibold",
                  "px-2 py-2 text-left border-b border-border",
                  stickyHeader && "sticky top-0 z-10 bg-surface",
                  col.align === "right" && "text-right",
                  col.sortable && "cursor-pointer hover:text-ink-primary",
                ].filter(Boolean).join(" ")}
                style={{ width: col.width }}
                onClick={col.sortable ? () => onSort?.(col.key) : undefined}
              >
                {col.header}
                {sortKey === col.key && (
                  <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={rowKey(row)}
              className={[
                "border-b border-border h-10",
                onRowClick && "cursor-pointer hover:bg-surface-raised",
              ].filter(Boolean).join(" ")}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={[
                    "px-2 py-1 text-sm text-ink-primary",
                    col.align === "right" && "text-right font-[var(--font-numeric)]",
                  ].filter(Boolean).join(" ")}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
