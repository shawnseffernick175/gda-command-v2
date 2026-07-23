"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/lib/sort-utils";

export interface SortableHeaderProps {
  /** Column display label. */
  label: string;
  /**
   * Field key sent to the sort handler. When undefined the column is
   * rendered as non-sortable (no cursor change, no indicator).
   */
  field?: string;
  /** Currently active sort field (from useTableSort). */
  sortBy: string | null;
  /** Current sort direction (from useTableSort). */
  sortDir: SortDirection;
  /** Click handler (from useTableSort). */
  onSort: (field: string) => void;
  /** Optional fixed width for the `<th>`. */
  width?: string;
  /** Text alignment — defaults to "left". */
  align?: "left" | "right";
  /** Extra className on the `<th>`. */
  className?: string;
  /** Optional inline filter dropdown (used by Opportunities Set-Aside). */
  filter?: {
    options: readonly string[];
    selected: string[];
    onToggle: (value: string) => void;
  };
  /**
   * Optional free-text column filter. When provided, a filter button opens a
   * small text input; the parent applies `value` to the column generically.
   */
  textFilter?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  /** Optional info tooltip rendered after sort/filter controls. */
  infoTooltip?: React.ReactNode;
}

export function SortableHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
  width,
  align = "left",
  className,
  filter,
  textFilter,
  infoTooltip,
}: SortableHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const ref = useRef<HTMLTableCellElement>(null);
  const active = field != null && sortBy === field;

  useEffect(() => {
    if (!menuOpen && !textOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setTextOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen, textOpen]);

  const indicator = active
    ? sortDir === "asc"
      ? "\u25B2"
      : "\u25BC"
    : "";

  const filterCount = filter?.selected.length ?? 0;

  return (
    <th
      ref={ref}
      className={cn(
        "relative px-3 py-2 font-medium bg-gda-bg-base",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      style={width ? { width } : undefined}
    >
      <div
        className={cn(
          "flex items-center gap-1",
          align === "right" && "justify-end",
        )}
      >
        {field ? (
          <button
            type="button"
            onClick={() => onSort(field)}
            className={cn(
              "flex items-center gap-1 transition-colors hover:text-foreground",
              active ? "text-gda-green" : "text-muted-foreground",
            )}
            title={`Sort by ${label}`}
          >
            <span>{label}</span>
            {indicator && (
              <span className="font-mono text-[12px] leading-none">
                {indicator}
              </span>
            )}
          </button>
        ) : (
          <span className="text-muted-foreground">{label}</span>
        )}
        {filter && (
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className={cn(
              "ml-0.5 rounded px-1 text-[12px] transition-colors",
              filterCount > 0
                ? "bg-gda-green/20 text-gda-green"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Filter"
          >
            {filterCount > 0 ? filterCount : "\u25BE"}
          </button>
        )}
        {textFilter && (
          <button
            type="button"
            onClick={() => setTextOpen((o) => !o)}
            className={cn(
              "ml-0.5 rounded px-1 text-[12px] transition-colors",
              textFilter.value
                ? "bg-gda-green/20 text-gda-green"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Filter"
          >
            {"▾"}
          </button>
        )}
        {infoTooltip}
      </div>

      {textFilter && textOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 w-48 rounded border border-border bg-gda-panel p-2 shadow-lg">
          <input
            autoFocus
            type="text"
            value={textFilter.value}
            onChange={(e) => textFilter.onChange(e.target.value)}
            placeholder={textFilter.placeholder ?? `Filter ${label}…`}
            className="w-full rounded border border-border bg-gda-bg-base px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-gda-green/50 focus:outline-none"
          />
          {textFilter.value && (
            <button
              type="button"
              onClick={() => textFilter.onChange("")}
              className="mt-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {filter && menuOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded border border-border bg-gda-panel shadow-lg">
          {filter.options.map((opt) => {
            const checked = filter.selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => filter.onToggle(opt)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-gda-bg-base",
                  checked
                    ? "text-gda-green"
                    : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 items-center justify-center rounded border text-[12px]",
                    checked
                      ? "border-gda-green bg-gda-green/20 text-gda-green"
                      : "border-border",
                  )}
                >
                  {checked ? "\u2713" : ""}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </th>
  );
}
