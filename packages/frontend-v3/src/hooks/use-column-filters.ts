"use client";

import { useCallback, useState } from "react";

export type ColumnFilterState = Record<string, string>;

export interface UseColumnFiltersReturn {
  /** Current per-column filter text, keyed by field. */
  filters: ColumnFilterState;
  /** Set (or clear, when value is empty) the filter for a column. */
  setFilter: (field: string, value: string) => void;
  /**
   * Apply the active filters to a list of rows. A row passes when, for every
   * active filter, the value at `accessor(row, field)` contains the filter
   * text (case-insensitive). `accessor` defaults to reading `row[field]`.
   */
  applyFilters: <T>(
    rows: T[],
    accessor?: (row: T, field: string) => unknown,
  ) => T[];
}

/**
 * Lightweight client-side per-column text filtering. Pairs with the
 * `textFilter` prop on SortableHeader so any column can be filtered generically.
 */
export function useColumnFilters(): UseColumnFiltersReturn {
  const [filters, setFilters] = useState<ColumnFilterState>({});

  const setFilter = useCallback((field: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) {
        next[field] = value;
      } else {
        delete next[field];
      }
      return next;
    });
  }, []);

  const applyFilters = useCallback(
    <T>(rows: T[], accessor?: (row: T, field: string) => unknown): T[] => {
      const active = Object.entries(filters).filter(([, v]) => v.trim() !== "");
      if (active.length === 0) return rows;

      const read =
        accessor ??
        ((row: T, field: string) =>
          (row as Record<string, unknown>)[field]);

      return rows.filter((row) =>
        active.every(([field, query]) => {
          const cell = read(row, field);
          if (cell == null) return false;
          return String(cell).toLowerCase().includes(query.toLowerCase());
        }),
      );
    },
    [filters],
  );

  return { filters, setFilter, applyFilters };
}
