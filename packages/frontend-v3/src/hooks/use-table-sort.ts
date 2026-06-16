"use client";

import { useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { SortDirection } from "@/lib/sort-utils";

export interface UseTableSortReturn {
  /** Currently sorted column field, or null when using default order. */
  sortBy: string | null;
  /** Current sort direction. Only meaningful when sortBy is non-null. */
  sortDir: SortDirection;
  /**
   * Three-state cycle handler:
   *   null  -> asc
   *   asc   -> desc
   *   desc  -> null (clear)
   *
   * Clicking a *different* column always starts at asc.
   */
  handleSort: (field: string) => void;
  /** Query params for server-side sort endpoints. */
  sortParams: { sort_by?: string; sort_dir?: SortDirection };
}

/**
 * URL-persisted table sort state.
 *
 * Reads `sort` and `dir` from the current URL search params and writes
 * them back on change so that refresh / back-button preserves the sort.
 *
 * @param prefix – Optional param-name prefix so multiple tables on one
 *   page don't collide (e.g. prefix "ft" → `ft_sort` / `ft_dir`).
 */
export function useTableSort(prefix?: string): UseTableSortReturn {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const sortKey = prefix ? `${prefix}_sort` : "sort";
  const dirKey = prefix ? `${prefix}_dir` : "dir";

  const sortBy = searchParams.get(sortKey) || null;
  const rawDir = searchParams.get(dirKey);
  const sortDir: SortDirection =
    rawDir === "asc" || rawDir === "desc" ? rawDir : "asc";

  const handleSort = useCallback(
    (field: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (sortBy === field) {
        // Same column: cycle asc → desc → clear
        if (sortDir === "asc") {
          params.set(sortKey, field);
          params.set(dirKey, "desc");
        } else {
          // Was desc → clear sort
          params.delete(sortKey);
          params.delete(dirKey);
        }
      } else {
        // New column → start ascending
        params.set(sortKey, field);
        params.set(dirKey, "asc");
      }

      // Reset pagination when sort changes
      params.delete("page");

      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, sortBy, sortDir, sortKey, dirKey, router, pathname],
  );

  const sortParams: { sort_by?: string; sort_dir?: SortDirection } = sortBy
    ? { sort_by: sortBy, sort_dir: sortDir }
    : {};

  return { sortBy, sortDir, handleSort, sortParams };
}
