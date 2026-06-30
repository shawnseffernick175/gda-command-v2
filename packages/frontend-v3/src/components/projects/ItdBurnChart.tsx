"use client";

import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts } from "@/lib/echarts-setup";
import type { ProjectFullRow } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";

const TEAL = "var(--color-fin-teal)";
const STONE = "var(--color-fin-stone)";
const SAND = "var(--color-fin-sand)";
const INK = "var(--color-fin-ink)";

export function ItdBurnChart({ project }: { project: ProjectFullRow }) {
  const funded = project.itd_funding;
  const billed = project.itd_billed_amount;
  const contractValue = project.itd_value;
  const remaining = Math.max(contractValue - billed, 0);
  const burnPct = contractValue > 0 ? (billed / contractValue) * 100 : 0;

  const hasData = contractValue > 0 || funded > 0 || billed > 0;

  if (!hasData) {
    return (
      <div className="flex h-72 items-center justify-center rounded border border-dashed border-border bg-gda-panel/30">
        <p className="text-sm text-muted-foreground">
          No ITD contract data yet
        </p>
      </div>
    );
  }

  const categories = funded > 0 ? ["Billed vs Value", "Funded"] : ["Billed vs Value"];

  const billedSeries = [billed];
  const remainingSeries = [remaining];
  const fundedSeries = funded > 0 ? [funded] : [];
  const fundedRemainSeries = funded > 0 ? [Math.max(contractValue - funded, 0)] : [];

  const option: Record<string, unknown> = {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (
        params: Array<{
          seriesName: string;
          value: number;
          marker: string;
        }>,
      ) => {
        const lines = params
          .filter((p) => p.value > 0)
          .map((p) => `${p.marker} ${p.seriesName}: ${formatMoney(p.value)}`);
        return lines.join("<br/>");
      },
    },
    legend: {
      data: funded > 0
        ? ["Billed", "Remaining", "Funded", "Unfunded"]
        : ["Billed", "Remaining"],
      bottom: 0,
      textStyle: { color: STONE, fontSize: 11 },
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 16,
    },
    grid: {
      left: 90,
      right: 24,
      top: 12,
      bottom: 40,
    },
    yAxis: {
      type: "category",
      data: categories,
      axisLabel: { color: STONE, fontSize: 11 },
      axisLine: { lineStyle: { color: SAND } },
      axisTick: { show: false },
    },
    xAxis: {
      type: "value",
      axisLabel: {
        color: STONE,
        fontSize: 11,
        formatter: (v: number) => formatMoney(v),
      },
      splitLine: { lineStyle: { color: SAND, type: "dashed" } },
      axisLine: { show: false },
    },
    series: [
      {
        name: "Billed",
        type: "bar",
        stack: "burn",
        data: billedSeries,
        itemStyle: { color: TEAL, borderRadius: [2, 0, 0, 2] },
        barMaxWidth: 32,
        label: {
          show: true,
          position: "inside",
          formatter: (p: { value: number }) => formatMoney(p.value),
          color: "var(--color-foreground)",
          fontSize: 11,
          fontWeight: 600,
        },
      },
      {
        name: "Remaining",
        type: "bar",
        stack: "burn",
        data: remainingSeries,
        itemStyle: { color: SAND, borderRadius: [0, 2, 2, 0] },
        barMaxWidth: 32,
        label: {
          show: remaining > 0,
          position: "inside",
          formatter: (p: { value: number }) => formatMoney(p.value),
          color: INK,
          fontSize: 11,
        },
      },
      ...(funded > 0
        ? [
            {
              name: "Funded",
              type: "bar" as const,
              stack: "funded",
              data: fundedSeries,
              itemStyle: { color: STONE, opacity: 0.6, borderRadius: [2, 0, 0, 2] },
              barMaxWidth: 32,
              label: {
                show: true,
                position: "inside" as const,
                formatter: (p: { value: number }) => formatMoney(p.value),
                color: "var(--color-foreground)",
                fontSize: 11,
              },
            },
            {
              name: "Unfunded",
              type: "bar" as const,
              stack: "funded",
              data: fundedRemainSeries,
              itemStyle: { color: SAND, opacity: 0.4, borderRadius: [0, 2, 2, 0] },
              barMaxWidth: 32,
            },
          ]
        : []),
    ],
  };

  return (
    <div className="rounded border border-border bg-white p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-fin-ink">ITD Contract Burn</h3>
        <span className="text-xs text-muted-foreground">
          {burnPct.toFixed(1)}% consumed
        </span>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Contract value: {formatMoney(contractValue)}
      </p>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: funded > 0 ? 160 : 120 }}
        notMerge
      />
      <div className="mt-3 grid grid-cols-3 gap-4 text-center text-xs">
        <div>
          <p className="text-muted-foreground">Contract Value</p>
          <p className="font-medium text-foreground tabular-nums">
            {formatMoney(contractValue)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Funded</p>
          <p className="font-medium text-foreground tabular-nums">
            {formatMoney(funded)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Billed</p>
          <p className="font-medium text-foreground tabular-nums">
            {formatMoney(billed)}
          </p>
        </div>
      </div>
    </div>
  );
}
