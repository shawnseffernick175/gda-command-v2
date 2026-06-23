/**
 * Client-side sort comparators for data tables.
 *
 * Empties (null / undefined / "") always sink to the bottom regardless of
 * sort direction, per the issue spec.
 */

export type SortDirection = "asc" | "desc";

export type SortType = "string" | "number" | "date" | "enum" | "period";

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

/** Month abbreviation → 0-based index for chronological period sorting. */
const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse fiscal period strings like "FY26 Jan", "FY25 Q3", "2026-01", etc.
 * Returns a numeric value suitable for chronological comparison.
 */
export function parsePeriod(v: unknown): number {
  const s = String(v).trim().toLowerCase();

  // "FY26 Jan" or "FY2026 Jan"
  const fyMonth = s.match(/fy(\d{2,4})\s+([a-z]{3})/);
  if (fyMonth) {
    const yr = fyMonth[1].length === 2 ? 2000 + Number(fyMonth[1]) : Number(fyMonth[1]);
    return yr * 12 + (MONTH_INDEX[fyMonth[2]] ?? 0);
  }

  // "FY26 Q1"
  const fyQ = s.match(/fy(\d{2,4})\s+q(\d)/);
  if (fyQ) {
    const yr = fyQ[1].length === 2 ? 2000 + Number(fyQ[1]) : Number(fyQ[1]);
    return yr * 12 + (Number(fyQ[2]) - 1) * 3;
  }

  // "Jan 2026" or "January 2026"
  const monthYear = s.match(/^([a-z]{3})[a-z]*\s+(\d{4})$/);
  if (monthYear) {
    return Number(monthYear[2]) * 12 + (MONTH_INDEX[monthYear[1]] ?? 0);
  }

  // ISO-like "2026-01"
  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) {
    return Number(iso[1]) * 12 + (Number(iso[2]) - 1);
  }

  return 0;
}

function comparePeriod(a: unknown, b: unknown): number {
  return parsePeriod(a) - parsePeriod(b);
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
      case "period":
        cmp = comparePeriod(va, vb);
        break;
      default:
        cmp = compareString(String(va), String(vb));
        break;
    }

    return cmp * dirMul;
  });
}
