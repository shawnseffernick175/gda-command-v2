/**
 * Client-side sort comparators for data tables.
 *
 * Empties (null / undefined / "") always sink to the bottom regardless of
 * sort direction, per the issue spec.
 */

export type SortDirection = "asc" | "desc";

export type SortType = "string" | "number" | "date" | "enum";

export interface ColumnSortConfig {
  field: string;
  type: SortType;
  /** For enum columns: display order (first = lowest rank). */
  enumOrder?: readonly string[];
  /** Custom accessor when the sort key differs from `item[field]`. */
  accessor?: (item: Record<string, unknown>) => unknown;
}

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

function accessField(
  item: Record<string, unknown>,
  col: ColumnSortConfig,
): unknown {
  if (col.accessor) return col.accessor(item);
  return item[col.field];
}

function compareString(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareNumber(a: unknown, b: unknown): number {
  return (Number(a) || 0) - (Number(b) || 0);
}

function compareDate(a: unknown, b: unknown): number {
  const da = new Date(a as string).getTime();
  const db = new Date(b as string).getTime();
  return (da || 0) - (db || 0);
}

function compareEnum(a: unknown, b: unknown, order: readonly string[]): number {
  const ia = order.indexOf(String(a));
  const ib = order.indexOf(String(b));
  return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
}

/**
 * Sort an array of items in-place (returns a new sorted copy).
 *
 * When `sortBy` is null the original order is preserved.
 */
export function sortData<T extends Record<string, unknown>>(
  items: T[],
  sortBy: string | null,
  sortDir: SortDirection,
  columns: ColumnSortConfig[],
): T[] {
  if (!sortBy) return items;

  const col = columns.find((c) => c.field === sortBy);
  if (!col) return items;

  const dirMul = sortDir === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    const va = accessField(a, col);
    const vb = accessField(b, col);
    const aEmpty = isEmptyValue(va);
    const bEmpty = isEmptyValue(vb);

    // Empties always sink to bottom regardless of direction
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;

    let cmp = 0;
    switch (col.type) {
      case "string":
        cmp = compareString(String(va), String(vb));
        break;
      case "number":
        cmp = compareNumber(va, vb);
        break;
      case "date":
        cmp = compareDate(va, vb);
        break;
      case "enum":
        cmp = compareEnum(va, vb, col.enumOrder ?? []);
        break;
    }

    return cmp * dirMul;
  });
}
