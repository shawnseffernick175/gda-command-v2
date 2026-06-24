"use client";

import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ProjectFullRow } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export function ItdBurnChart({ project }: { project: ProjectFullRow }) {
  const funded = project.itd_funding;
  const billed = project.itd_billed_amount;
  const contractValue = project.itd_value;
  const remaining = Math.max(contractValue - billed, 0);
  const burnPct = contractValue > 0 ? (billed / contractValue) * 100 : 0;

  const hasData = contractValue > 0 || funded > 0 || billed > 0;

  if (!hasData) {
    return (
      <div className="flex h-48 items-center justify-center rounded border border-dashed border-border bg-gda-panel/30">
        <p className="text-sm text-muted-foreground">No ITD contract data yet</p>
      </div>
    );
  }

  const option: Record<string, unknown> = {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: Array<{ seriesName: string; value: number; marker: string }>) =>
        params
          .map((p) => `${p.marker} ${p.seriesName}: ${formatMoney(p.value)}`)
          .join("<br/>"),
    },
    legend: {
      data: ["Billed", "Remaining"],
      bottom: 0,
      textStyle: { color: "var(--color-fin-stone)", fontSize: 11 },
    },
    grid: { left: 80, right: 24, top: 16, bottom: 40 },
    xAxis: {
      type: "value",
      axisLabel: {
        color: "var(--color-fin-stone)",
        fontSize: 11,
        formatter: (v: number) => formatMoney(v),
      },
      splitLine: { lineStyle: { color: "var(--color-fin-sand)", type: "dashed" as const } },
    },
    yAxis: {
      type: "category",
      data: ["Contract"],
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 11 },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
    },
    series: [
      {
        name: "Billed",
        type: "bar",
        stack: "total",
        data: [billed],
        itemStyle: { color: "var(--color-fin-teal)", borderRadius: [2, 0, 0, 2] },
        barWidth: 28,
        label: {
          show: true,
          position: "inside",
          fontSize: 11,
          fontWeight: 600,
          color: "#ffffff",
          formatter: (p: { value: number }) => formatMoney(p.value),
        },
      },
      {
        name: "Remaining",
        type: "bar",
        stack: "total",
        data: [remaining],
        itemStyle: { color: "var(--color-fin-sand)", borderRadius: [0, 2, 2, 0] },
        barWidth: 28,
        label: {
          show: true,
          position: "inside",
          fontSize: 11,
          color: "var(--color-fin-ink)",
          formatter: (p: { value: number }) => formatMoney(p.value),
        },
      },
    ],
  };

  return (
    <div className="rounded border border-border bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-fin-ink">
          ITD Contract Burn
        </h3>
        <span className="text-xs text-muted-foreground">
          {burnPct.toFixed(1)}% consumed
        </span>
      </div>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: 100 }}
        notMerge
      />
      <div className="mt-3 grid grid-cols-3 gap-4 text-center text-xs">
        <div>
          <p className="text-muted-foreground">Contract Value</p>
          <p className="font-medium text-foreground">{formatMoney(contractValue)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Funded</p>
          <p className="font-medium text-foreground">{formatMoney(funded)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Billed</p>
          <p className="font-medium text-foreground">{formatMoney(billed)}</p>
        </div>
      </div>
    </div>
  );
}
