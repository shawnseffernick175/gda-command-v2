"use client";

import { useMemo } from "react";
import { useIngestionCoverage } from "@/hooks/use-financial-bible";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { cn } from "@/lib/utils";
import { echarts, ReactEChartsCore } from "@/lib/echarts-setup";
import type { IngestionCoverageStatus } from "@/lib/types";

const IC_SORT_COLS: ColumnSortConfig[] = [
  { field: "doc_id", type: "string" },
  { field: "filename", type: "string" },
  { field: "status", type: "string" },
  { field: "total_rows", type: "number" },
];

const STATUS_LABEL: Record<IngestionCoverageStatus, string> = {
  ingested: "Ingested",
  skipped_duplicate: "Skipped (duplicate)",
  not_ingested: "Not Ingested",
  extraction_failed: "Extract Failed",
};

const STATUS_BADGE: Record<IngestionCoverageStatus, string> = {
  ingested: "bg-gda-green/15 text-gda-green",
  skipped_duplicate: "border border-border bg-gda-panel text-muted-foreground",
  not_ingested: "bg-gda-red/15 text-gda-red",
  extraction_failed: "bg-amber-400/15 text-amber-400",
};

export function IngestionCoverageTab() {
  const { data, isLoading } = useIngestionCoverage();
  const { sortBy, sortDir, handleSort } = useTableSort("ic");

  const coverage = useMemo(() => data?.coverage ?? [], [data]);
  const summary = data?.summary ?? {
    total: 0,
    ingested: 0,
    skipped_duplicate: 0,
    not_ingested: 0,
    extraction_failed: 0,
    no_handler: 0,
  };

  const itemsWithTotalRows = useMemo(
    () =>
      coverage.map((doc) => ({
        ...doc,
        total_rows: doc.row_count ?? doc.destinations.reduce((s, d) => s + d.row_count, 0),
      })),
    [coverage],
  );

  const sortedItems = useMemo(() => {
    if (!sortBy) return itemsWithTotalRows;
    return sortData(
      itemsWithTotalRows as unknown as Record<string, unknown>[],
      sortBy,
      sortDir,
      IC_SORT_COLS,
    ) as unknown as typeof itemsWithTotalRows;
  }, [itemsWithTotalRows, sortBy, sortDir]);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-skeleton" />;
  }

  if (coverage.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        No financial documents found in the Vault.
      </p>
    );
  }

  const pctIngested =
    summary.total > 0 ? ((summary.ingested / summary.total) * 100).toFixed(1) : "0.0";

  const categories: string[] = [];
  const values: number[] = [];
  const colors: string[] = [];
  if (summary.ingested > 0) {
    categories.push("Ingested");
    values.push(summary.ingested);
    colors.push("var(--color-gda-green)");
  }
  if (summary.skipped_duplicate > 0) {
    categories.push("Skipped");
    values.push(summary.skipped_duplicate);
    colors.push("var(--color-fin-stone)");
  }
  if (summary.not_ingested > 0) {
    categories.push("Not Ingested");
    values.push(summary.not_ingested);
    colors.push("var(--color-gda-red)");
  }
  if (summary.extraction_failed > 0) {
    categories.push("Failed");
    values.push(summary.extraction_failed);
    colors.push("var(--color-fin-amber)");
  }

  const chartOption = {
    tooltip: { trigger: "axis" as const },
    grid: { left: 40, right: 16, top: 16, bottom: 32 },
    xAxis: {
      type: "category" as const,
      data: categories,
      axisLabel: { fontSize: 12, color: "var(--color-fin-stone)" },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: { fontSize: 12, color: "var(--color-fin-stone)" },
    },
    series: [
      {
        type: "bar" as const,
        data: values.map((v, i) => ({ value: v, itemStyle: { color: colors[i] } })),
        label: { show: true, position: "top" as const, fontSize: 12 },
        barMaxWidth: 48,
      },
    ],
  };

  return (
    <div className="space-y-4">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Kpi label="Total Docs" value={String(summary.total)} />
        <Kpi label="Ingested" value={String(summary.ingested)} subtitle={`${pctIngested}% coverage`} />
        <Kpi label="Skipped (dup)" value={String(summary.skipped_duplicate)} />
        <Kpi label="Not Ingested" value={String(summary.not_ingested)} />
        <Kpi label="Extraction Failed" value={String(summary.extraction_failed)} />
      </div>

      {/* Chart */}
      <div className="rounded border border-border bg-white p-4">
        <p className="mb-2 text-[12px] uppercase tracking-wider text-muted-foreground">
          Document Ingestion Status
        </p>
        <ReactEChartsCore echarts={echarts} option={chartOption} style={{ height: 220 }} notMerge />
      </div>

      {/* Table with sticky header + sortable columns */}
      <div className="rounded border border-border overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-gda-bg-base text-[12px] uppercase tracking-wider text-muted-foreground">
              <SortableHeader label="Doc ID" field="doc_id" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Filename" field="filename" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Status" field="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium bg-gda-bg-base">Destination / Reason</th>
              <SortableHeader label="Total Rows" field="total_rows" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((doc) => (
              <tr
                key={doc.doc_id}
                className="border-b border-border hover:bg-gda-panel/50"
              >
                <td className="px-3 py-2 text-left text-muted-foreground">
                  {doc.doc_id}
                </td>
                <td className="px-3 py-2 text-left text-foreground">
                  {doc.filename}
                </td>
                <td className="px-3 py-2 text-left">
                  <span
                    className={cn(
                      "inline-block rounded px-1.5 py-0.5 text-[12px] font-medium",
                      STATUS_BADGE[doc.status],
                    )}
                  >
                    {STATUS_LABEL[doc.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-left text-muted-foreground">
                  {doc.destinations.length > 0
                    ? doc.destinations
                        .map((d) => `${d.table} (${d.row_count})`)
                        .join(", ")
                    : doc.reason ?? "—"}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {doc.total_rows}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
