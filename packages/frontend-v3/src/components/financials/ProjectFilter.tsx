"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  useProjectRevenue,
  useContractWaterfall,
  useArByContract,
} from "@/hooks/use-financial-bible";
import { cn } from "@/lib/utils";
import type { CalendarMode } from "@/lib/types";

/**
 * Tabs whose underlying books carry a real per-project (contract / task-order)
 * dimension. Every other Financial-Bible tab is an entity-level statement
 * (balance sheet, trial balance, indirect pools, company plan, pricing …) that
 * is NOT broken out by project — filtering those would mean inventing numbers,
 * so the control is shown disabled with an explanatory note instead.
 */
export const PROJECT_FILTERABLE_TABS = [
  "p2",
  "project-revenue",
  "waterfall",
  "ar",
] as const;

export type ProjectFilterableTab = (typeof PROJECT_FILTERABLE_TABS)[number];

export function isProjectFilterableTab(tab: string): tab is ProjectFilterableTab {
  return (PROJECT_FILTERABLE_TABS as readonly string[]).includes(tab);
}

export interface ProjectOption {
  value: string;
  label: string;
}

const CALENDAR_MODE_KEY = "gda-financial-bible-calendar-mode";

function subscribeToStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
function getCalendarSnapshot(): CalendarMode {
  return localStorage.getItem(CALENDAR_MODE_KEY) === "CY" ? "CY" : "FY";
}
function getCalendarServerSnapshot(): CalendarMode {
  return "FY";
}

/* ── Presentational multi-select ──────────────────────────────── */

function ProjectMultiSelect({
  options,
  selected,
  onChange,
  disabled,
  note,
  isLoading,
}: {
  options: ProjectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  note?: string;
  isLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Reconcile the selection with the current option set: when the options
  // change (e.g. AR's FY/CY toggle rewrites contract labels), prune any
  // selected value that no longer exists so the label and the actually-filtered
  // data can never disagree — and the user is never left with a hidden,
  // unclearable filter.
  const validSelected = useMemo(() => {
    const valid = new Set(options.map((o) => o.value));
    return selected.filter((s) => valid.has(s));
  }, [options, selected]);

  useEffect(() => {
    if (isLoading || options.length === 0) return;
    if (validSelected.length !== selected.length) {
      onChange(validSelected);
    }
  }, [isLoading, options.length, validSelected, selected, onChange]);

  const summary = (() => {
    if (validSelected.length === 0) return "All projects";
    if (validSelected.length === 1) {
      return options.find((o) => o.value === validSelected[0])?.label ?? "1 project";
    }
    return `${validSelected.length} of ${options.length} projects`;
  })();

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div className="flex flex-col gap-0.5" ref={rootRef}>
      <span className="text-[12px] uppercase tracking-wider text-muted-foreground/60 font-medium select-none">
        Project
      </span>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          aria-label="Filter by project"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex min-w-[160px] max-w-[280px] items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1 text-[12px] text-foreground transition-colors",
            disabled
              ? "cursor-not-allowed opacity-60"
              : "hover:border-gda-cyan/60",
          )}
        >
          <span className="truncate">
            {disabled ? "Not project-scoped" : summary}
          </span>
          <span className="text-muted-foreground">{open ? "▴" : "▾"}</span>
        </button>

        {open && !disabled && (
          <div className="absolute right-0 z-30 mt-1 max-h-[320px] w-[280px] overflow-y-auto rounded border border-border bg-popover p-1 shadow-md ring-1 ring-foreground/10">
            <div className="flex items-center justify-between px-2 py-1">
              <button
                type="button"
                className="text-[12px] font-medium text-gda-cyan hover:underline disabled:opacity-40"
                disabled={validSelected.length === 0}
                onClick={() => onChange([])}
              >
                All projects
              </button>
              <span className="text-[12px] text-muted-foreground">
                {options.length} total
              </span>
            </div>
            <div className="my-1 h-px bg-border" />
            {isLoading ? (
              <p className="px-2 py-3 text-center text-[12px] text-muted-foreground">
                Loading projects…
              </p>
            ) : options.length === 0 ? (
              <p className="px-2 py-3 text-center text-[12px] text-muted-foreground">
                No projects available.
              </p>
            ) : (
              options.map((o) => {
                const checked = selected.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] text-foreground hover:bg-gda-panel/60"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                        checked
                          ? "border-gda-cyan bg-gda-cyan"
                          : "border-border",
                      )}
                    >
                      {checked && (
                        <span className="h-1.5 w-1.5 rounded-[1px] bg-gda-bg-deep" />
                      )}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
      {note && (
        <span className="mt-0.5 text-[12px] text-muted-foreground/70">{note}</span>
      )}
    </div>
  );
}

/* ── Per-tab option sources ───────────────────────────────────── */

function dedupeOptions(options: ProjectOption[]): ProjectOption[] {
  const seen = new Set<string>();
  const out: ProjectOption[] = [];
  for (const o of options) {
    if (o.value && !seen.has(o.value)) {
      seen.add(o.value);
      out.push(o);
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

function ProjectRevenueFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  // Options are the full YTD project set so the list is stable regardless of
  // the period the tab is currently showing.
  const { data, isLoading } = useProjectRevenue("YTD");
  const options = useMemo(
    () =>
      dedupeOptions(
        (data?.items ?? []).map((r) => ({
          value: r.project_name,
          label: r.contract_number
            ? `${r.project_name} (${r.contract_number})`
            : r.project_name,
        })),
      ),
    [data],
  );
  return (
    <ProjectMultiSelect
      options={options}
      selected={selected}
      onChange={onChange}
      isLoading={isLoading}
    />
  );
}

function IncomeStatementFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  // Options are the full YTD project set from the same book the project income
  // statement reads (`project_revenue_actuals`), keyed by project name.
  const { data, isLoading } = useProjectRevenue("YTD");
  const options = useMemo(
    () =>
      dedupeOptions(
        (data?.items ?? []).map((r) => ({
          value: r.project_name,
          label: r.contract_number
            ? `${r.project_name} (${r.contract_number})`
            : r.project_name,
        })),
      ),
    [data],
  );
  return (
    <ProjectMultiSelect
      options={options}
      selected={selected}
      onChange={onChange}
      isLoading={isLoading}
      note="Selecting projects shows a project-level income statement from the cost-pool book."
    />
  );
}

function WaterfallFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  // Unfiltered task-order list so the option set is independent of the tab's
  // own status/role/vehicle/date filters.
  const { data, isLoading } = useContractWaterfall();
  const options = useMemo(
    () =>
      dedupeOptions(
        (data?.contracts ?? []).map((c) => ({
          value: c.to_number,
          label: c.to_number ? `${c.to_name} (${c.to_number})` : c.to_name,
        })),
      ),
    [data],
  );
  return (
    <ProjectMultiSelect
      options={options}
      selected={selected}
      onChange={onChange}
      isLoading={isLoading}
      note="Filters task orders across the chart, forecast and table."
    />
  );
}

function ArFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const mode = useSyncExternalStore(
    subscribeToStorage,
    getCalendarSnapshot,
    getCalendarServerSnapshot,
  );
  const { data, isLoading } = useArByContract(mode);
  const options = useMemo(
    () =>
      dedupeOptions(
        (data?.contracts ?? []).map((c) => ({
          value: c.contract,
          label: c.contract,
        })),
      ),
    [data],
  );
  return (
    <ProjectMultiSelect
      options={options}
      selected={selected}
      onChange={onChange}
      isLoading={isLoading}
      note="Filters the Receivables-by-Contract matrix; aging/customer views are portfolio-level."
    />
  );
}

/* ── Public entry point ───────────────────────────────────────── */

export function ProjectFilter({
  tab,
  selected,
  onChange,
}: {
  tab: string;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  if (tab === "p2") {
    return <IncomeStatementFilter selected={selected} onChange={onChange} />;
  }
  if (tab === "project-revenue") {
    return <ProjectRevenueFilter selected={selected} onChange={onChange} />;
  }
  if (tab === "waterfall") {
    return <WaterfallFilter selected={selected} onChange={onChange} />;
  }
  if (tab === "ar") {
    return <ArFilter selected={selected} onChange={onChange} />;
  }
  return (
    <ProjectMultiSelect
      options={[]}
      selected={[]}
      onChange={() => {}}
      disabled
      note="Entity-level statement — not broken out by project."
    />
  );
}
