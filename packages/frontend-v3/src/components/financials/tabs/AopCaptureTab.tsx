"use client";

import { useMemo } from "react";
import { useAopCapture } from "@/hooks/use-financial-bible";
import { NumberCell } from "@/components/financials/primitives/NumberCell";
import { SourceFooter } from "@/components/financials/SourceFooter";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { formatMoney } from "@/lib/format-money";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { echarts, ReactEChartsCore } from "@/lib/echarts-setup";

const STAGE_LABELS: Record<string, string> = {
  interest: "Investigating",
  qualified: "Qualified",
  pursue: "Pursue",
  proposal: "Proposal",
  post_submittal: "Submitted",
};

const CAPTURE_SORT_COLS: ColumnSortConfig[] = [
  { field: "title", type: "string" },
  { field: "agency", type: "string" },
  { field: "stage", type: "enum", enumOrder: ["interest", "qualified", "pursue", "proposal", "post_submittal"] },
  { field: "value", type: "number" },
  { field: "pwin", type: "number" },
  { field: "capture_owner", type: "string" },
  { field: "response_due_at", type: "date" },
];

export function AopCaptureTab({ fy }: { fy: string }) {
  const { data, isLoading, error } = useAopCapture(fy);
  const { sortBy, sortDir, handleSort } = useTableSort("cap");

  const sortedItems = useMemo(() => {
    const raw = data?.items ?? [];
    if (sortBy) {
      return sortData(raw as unknown as Record<string, unknown>[], sortBy, sortDir, CAPTURE_SORT_COLS) as unknown as typeof raw;
    }
    return raw;
  }, [data?.items, sortBy, sortDir]);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading {fy} capture pipeline...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-gda-red">
        Failed to load capture data: {error.message}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="rounded border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No capture plans active. Move opportunities from Opportunities to
          Pursue to populate this tab.
        </p>
      </div>
    );
  }

  const totalValue = data.items.reduce((s, i) => s + (i.value ?? 0), 0);
  const avgPwin =
    data.items.length > 0
      ? data.items.reduce((s, i) => s + (i.pwin ?? 0), 0) / data.items.length
      : 0;

  const stageCounts = new Map<string, { count: number; value: number }>();
  for (const item of data.items) {
    const label = STAGE_LABELS[item.stage] ?? item.stage;
    const prev = stageCounts.get(label) ?? { count: 0, value: 0 };
    stageCounts.set(label, { count: prev.count + 1, value: prev.value + (item.value ?? 0) });
  }
  const stageEntries = [...stageCounts.entries()];

  return (
    <div className="space-y-4">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Active Captures" value={String(data.items.length)} />
        <Kpi label="Total Pipeline" value={formatMoney(totalValue)} />
        <Kpi label="Avg pWin" value={`${avgPwin.toFixed(1)}%`} />
        <Kpi label="Stages" value={String(stageEntries.length)} />
      </div>

      {/* Pipeline by stage chart (G1) */}
      <div className="rounded border border-border bg-white p-4">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          Pipeline by Stage
        </p>
        <ReactEChartsCore
          echarts={echarts}
          style={{ height: 220 }}
          notMerge
          option={{
            tooltip: {
              trigger: "axis" as const,
              axisPointer: { type: "shadow" as const },
            },
            grid: { left: 80, right: 16, top: 8, bottom: 32 },
            xAxis: {
              type: "category" as const,
              data: stageEntries.map(([s]) => s),
              axisLabel: { color: "var(--color-fin-stone)", fontSize: 11 },
              axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
            },
            yAxis: {
              type: "value" as const,
              axisLabel: {
                color: "var(--color-fin-stone)",
                fontSize: 11,
                formatter: (v: number) => formatMoney(v),
              },
              splitLine: { lineStyle: { color: "var(--color-fin-sand)", type: "dashed" as const } },
            },
            series: [
              {
                type: "bar" as const,
                data: stageEntries.map(([, v]) => v.value),
                itemStyle: { color: "var(--color-fin-navy)" },
                label: {
                  show: true,
                  position: "top" as const,
                  fontSize: 11,
                  color: "var(--color-fin-stone)",
                  formatter: (p: { value: number }) => formatMoney(p.value),
                },
              },
            ],
          }}
        />
      </div>

      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-gda-bg-base text-[11px] uppercase tracking-wider text-muted-foreground">
              <SortableHeader label="Title" field="title" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Agency" field="agency" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Stage" field="stage" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Value" field="value" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="pWin" field="pwin" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Owner" field="capture_owner" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Due Date" field="response_due_at" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => (
              <tr
                key={item.id}
                className="border-b border-border/50"
              >
                <td className="max-w-[300px] truncate py-2 pr-4 font-medium text-foreground">
                  {item.title}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {item.agency ?? <span className="italic">N/A</span>}
                </td>
                <td className="py-2 pr-4">
                  <span className="rounded bg-fin-navy/30 px-2 py-0.5 text-[11px] font-medium text-foreground">
                    {STAGE_LABELS[item.stage] ?? item.stage}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right">
                  <NumberCell value={item.value} format="money" />
                </td>
                <td className="py-2 pr-4 text-right">
                  <NumberCell value={item.pwin} format="percent" />
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {item.capture_owner}
                </td>
                <td className="py-2 text-muted-foreground">
                  {item.response_due_at ?? <span className="italic">N/A</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SourceFooter meta={data.meta} />
    </div>
  );
}
