"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useProjectList, useProjectSnapshot, useProjectTrend } from "@/hooks/use-projects";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { ProjectKpiStrip } from "@/components/projects/ProjectKpiStrip";
import { ActualVsTargetChart } from "@/components/projects/ActualVsTargetChart";
import { ProfitMarginCard } from "@/components/projects/ProfitMarginCard";
import { ItdBurnChart } from "@/components/projects/ItdBurnChart";
import { MonthlyRevenueTrend } from "@/components/projects/MonthlyRevenueTrend";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";

const SORT_COLS: ColumnSortConfig[] = [
  { field: "project_id", type: "string" },
  { field: "project_name", type: "string" },
  { field: "itd_value", type: "number" },
  { field: "itd_billed_amount", type: "number" },
  { field: "open_ar", type: "number" },
  { field: "actual_period_revenue", type: "number" },
  { field: "actual_period_profit", type: "number" },
  { field: "margin_pct", type: "number" },
];

/* ─── Snapshot (drill-down) view ─── */

function ProjectSnapshotView({
  projectKey,
  period,
  onBack,
}: {
  projectKey: string;
  period: string | undefined;
  onBack: () => void;
}) {
  const { data, isLoading, error } = useProjectSnapshot(projectKey, period);
  const { data: trendData, isLoading: trendLoading } =
    useProjectTrend(projectKey);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-gda-skeleton" />
        <div className="grid grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded bg-gda-skeleton" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-72 animate-pulse rounded bg-gda-skeleton" />
          <div className="h-72 animate-pulse rounded bg-gda-skeleton" />
        </div>
      </div>
    );
  }

  if (error || !data?.project) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </button>
        <div className="rounded border border-dashed border-border bg-gda-panel/30 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Project not found or no data for this period
          </p>
        </div>
      </div>
    );
  }

  const project = data.project;
  const trendItems = trendData?.items ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-3 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </button>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-semibold text-foreground">
            {project.project_id ?? project.project_name}
          </h1>
          {project.project_id && (
            <span className="text-sm text-muted-foreground">
              {project.project_name}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
          {project.contract_number && (
            <span>Contract: {project.contract_number}</span>
          )}
          <span>Period: {project.period}</span>
          <span>Contract Value: {formatMoney(project.itd_value)}</span>
        </div>
      </div>

      <ProjectKpiStrip project={project} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ActualVsTargetChart project={project} />
        <ProfitMarginCard project={project} />
        <ItdBurnChart project={project} />
        {trendLoading ? (
          <div className="h-72 animate-pulse rounded bg-gda-skeleton" />
        ) : (
          <MonthlyRevenueTrend items={trendItems} />
        )}
      </div>
    </div>
  );
}

/* ─── List view ─── */

function ProjectsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeProject = searchParams.get("project");
  const periodParam = searchParams.get("period") ?? undefined;

  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(periodParam);
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useProjectList(selectedPeriod);
  const { sortBy, sortDir, handleSort } = useTableSort("proj");

  const items = useMemo(() => {
    let rows = data?.items ?? [];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.project_name.toLowerCase().includes(q) ||
          (r.project_id ?? "").toLowerCase().includes(q) ||
          (r.contract_number ?? "").toLowerCase().includes(q),
      );
    }
    if (sortBy) {
      return sortData(
        rows as unknown as Record<string, unknown>[],
        sortBy,
        sortDir,
        SORT_COLS,
      ) as unknown as typeof rows;
    }
    return rows;
  }, [data, search, sortBy, sortDir]);

  const periods = data?.periods ?? [];
  const activePeriod =
    selectedPeriod ?? (items.length > 0 ? items[0].period : null);

  const handleRowClick = useCallback(
    (projectKey: string) => {
      const params = new URLSearchParams();
      params.set("project", projectKey);
      if (activePeriod) params.set("period", activePeriod);
      router.push(`/projects?${params.toString()}`);
    },
    [router, activePeriod],
  );

  const handleBack = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedPeriod) params.set("period", selectedPeriod);
    const qs = params.toString();
    router.push(`/projects${qs ? `?${qs}` : ""}`);
  }, [router, selectedPeriod]);

  if (activeProject) {
    return (
      <ProjectSnapshotView
        projectKey={decodeURIComponent(activeProject)}
        period={periodParam}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div className="sticky-page-header sticky top-0 z-20 -mx-6 bg-background/95 px-6 pb-3 pt-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-foreground">Projects</h1>
          <div className="flex items-center gap-3">
            <select
              value={selectedPeriod ?? ""}
              onChange={(e) =>
                setSelectedPeriod(e.target.value || undefined)
              }
              className="rounded border border-border bg-gda-panel px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">Latest period</option>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded border border-border bg-gda-panel px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-gda-green/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-gda-skeleton" />
          ))}
        </div>
      )}

      {error && !isLoading && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Failed to load projects
        </p>
      )}

      {!isLoading && !error && items.length === 0 && (
        <div className="rounded border border-dashed border-border bg-gda-panel/30 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {search
              ? "No projects match your search"
              : "No project data for this period yet"}
          </p>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="rounded border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-[12px] text-muted-foreground">
                <SortableHeader
                  label="Project ID"
                  field="project_id"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Name"
                  field="project_name"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="ITD Value"
                  field="itd_value"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="ITD Billed"
                  field="itd_billed_amount"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="Open AR"
                  field="open_ar"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="Period Revenue"
                  field="actual_period_revenue"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="Period Profit"
                  field="actual_period_profit"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeader
                  label="Margin %"
                  field="margin_pct"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-border transition-colors hover:bg-gda-panel/50"
                  onClick={() =>
                    handleRowClick(row.project_id ?? row.project_name)
                  }
                >
                  <td className="px-3 py-2 text-foreground">
                    {row.project_id ?? "\u2014"}
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-foreground">
                    {row.project_name}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {formatMoney(row.itd_value)}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {formatMoney(row.itd_billed_amount)}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {formatMoney(row.open_ar)}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {formatMoney(row.actual_period_revenue)}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {formatMoney(row.actual_period_profit)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right",
                      row.margin_pct != null && row.margin_pct >= 0
                        ? "text-gda-green"
                        : row.margin_pct != null
                          ? "text-gda-red"
                          : "text-muted-foreground",
                    )}
                  >
                    {row.margin_pct != null
                      ? `${row.margin_pct.toFixed(1)}%`
                      : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl p-6">
          <div className="h-10 w-48 animate-pulse rounded bg-gda-skeleton" />
        </div>
      }
    >
      <ProjectsContent />
    </Suspense>
  );
}
