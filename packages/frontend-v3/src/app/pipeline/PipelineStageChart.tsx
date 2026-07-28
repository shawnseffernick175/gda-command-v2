"use client";

import { useMemo } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts } from "@/lib/echarts-setup";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";
import { stageKeyToLabel } from "@/lib/stages";
import type { PipelineSummary, PipelineStageStats } from "@/hooks/use-pipeline";

/* ── Stage config (matches the pipeline stage model) ───────────── */

const STAGE_BUCKETS = [
  { label: "Interest", dbKey: "interest", color: "var(--color-fin-stone)" },
  { label: "Qualified", dbKey: "qualified", color: "var(--color-fin-chart-navy)" },
  { label: "Pursue", dbKey: "pursue", color: "var(--color-chart-3)" },
  { label: "Solicitation", dbKey: "solicitation", color: "var(--color-chart-2)" },
  { label: "Submission", dbKey: "post_submittal", color: "var(--color-chart-4)" },
  { label: "Won", dbKey: "won", color: "var(--color-chart-1)" },
] as const;

const INK = "var(--color-fin-ink)";
const MUTED = "var(--color-fin-stone)";
const SAND = "var(--color-fin-sand)";

function stageDisplayLabel(dbKey: string): string {
  if (dbKey === "post_submittal") return "Submission";
  return stageKeyToLabel(dbKey);
}

/** One KPI figure rendered inline on the chart card. */
function StatTile({
  label,
  sub,
  onClick,
}: {
  label: string;
  sub: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded border border-border bg-gda-bg-base px-3 py-1.5 text-left",
        onClick && "hover:bg-gda-panel transition-colors",
      )}
    >
      <div className="font-mono text-sm font-bold text-foreground tabular-nums">
        {label}
      </div>
      <div className="font-mono text-[12px] text-muted-foreground">{sub}</div>
    </Tag>
  );
}

export function PipelineStageChart({
  summary,
  activeBucket,
  onBucketClick,
  onClear,
}: {
  summary: PipelineSummary;
  activeBucket: string | null;
  onBucketClick: (label: string) => void;
  onClear: () => void;
}) {
  const rows = useMemo(
    () =>
      STAGE_BUCKETS.map((b) => {
        const stats: PipelineStageStats =
          summary.by_stage[stageDisplayLabel(b.dbKey)] ??
          summary.by_stage[stageKeyToLabel(b.dbKey)] ?? {
            count: 0,
            value: 0,
            weighted_value: 0,
          };
        return { ...b, stats };
      }),
    [summary],
  );

  const option = useMemo(() => {
    const categories = rows.map((r) => r.label);

    const valueSeries = rows.map((r) => ({
      value: r.stats.value,
      itemStyle: {
        color: r.color,
        borderRadius: [3, 3, 0, 0],
        opacity: activeBucket && activeBucket !== r.label ? 0.35 : 1,
        borderColor: activeBucket === r.label ? INK : "transparent",
        borderWidth: activeBucket === r.label ? 1.5 : 0,
      },
    }));

    const weightedSeries = rows.map((r) => ({
      value: r.stats.weighted_value,
      itemStyle: {
        color: r.color,
        opacity: activeBucket && activeBucket !== r.label ? 0.15 : 0.4,
        borderRadius: [3, 3, 0, 0],
      },
    }));

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (
          params: Array<{ dataIndex: number; marker: string }>,
        ) => {
          if (!params.length) return "";
          const idx = params[0].dataIndex;
          const r = rows[idx];
          return [
            `<strong>${r.label}</strong>`,
            `${r.stats.count} opp${r.stats.count !== 1 ? "s" : ""}`,
            `Value: ${formatMoney(r.stats.value)}`,
            `Weighted: ${formatMoney(r.stats.weighted_value)}`,
          ].join("<br/>");
        },
      },
      legend: {
        data: ["Total Value", "Weighted Value"],
        bottom: 0,
        textStyle: { color: MUTED, fontSize: 12 },
        itemWidth: 12,
        itemHeight: 8,
        itemGap: 20,
      },
      grid: { left: 60, right: 16, top: 24, bottom: 48 },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: {
          color: INK,
          fontSize: 12,
          interval: 0,
          formatter: (label: string, idx: number) =>
            `${label}\n${rows[idx].stats.count} opp${rows[idx].stats.count !== 1 ? "s" : ""}`,
          lineHeight: 15,
        },
        axisLine: { lineStyle: { color: SAND } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: MUTED,
          fontSize: 12,
          formatter: (v: number) => formatMoney(v),
        },
        splitLine: { lineStyle: { color: SAND, type: "dashed" } },
        axisLine: { show: false },
      },
      series: [
        {
          name: "Total Value",
          type: "bar",
          data: valueSeries,
          barMaxWidth: 34,
          barGap: "10%",
          label: {
            show: true,
            position: "top",
            formatter: (p: { value: number }) =>
              p.value > 0 ? formatMoney(p.value) : "",
            color: INK,
            fontSize: 12,
          },
        },
        {
          name: "Weighted Value",
          type: "bar",
          data: weightedSeries,
          barMaxWidth: 34,
        },
      ],
    };
  }, [rows, activeBucket]);

  const onEvents = useMemo(
    () => ({
      click: (params: unknown) => {
        const p = params as { componentType?: string; dataIndex?: number };
        if (p.componentType !== "series") return;
        const idx = p.dataIndex ?? -1;
        if (idx < 0 || idx >= rows.length) return;
        onBucketClick(rows[idx].label);
      },
    }),
    [rows, onBucketClick],
  );

  return (
    <div className="rounded border border-border bg-gda-panel overflow-hidden">
      {/* Header + KPI figures */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-mono text-xs font-bold uppercase text-muted-foreground tracking-wider">
          Pipeline by Stage
        </h2>
        <div className="flex flex-wrap gap-2">
          <StatTile
            label={formatMoney(summary.total_pipeline_value)}
            sub="Total Pipeline"
            onClick={onClear}
          />
          <StatTile
            label={formatMoney(summary.weighted_pipeline_value)}
            sub="Weighted Pipeline"
          />
          <StatTile
            label={String(summary.active_pursuits)}
            sub="Active Pursuits"
            onClick={onClear}
          />
          <StatTile
            label={String(summary.proposals_out)}
            sub="Proposals Out"
            onClick={() => onBucketClick("Submission")}
          />
          <StatTile
            label={formatMoney(summary.won_ytd)}
            sub="Won YTD"
            onClick={() => onBucketClick("Won")}
          />
        </div>
      </div>

      {/* Stage chart */}
      <div className="px-2 pt-2">
        <ReactEChartsCore
          echarts={echarts}
          option={option}
          onEvents={onEvents}
          style={{ height: 300 }}
          notMerge
        />
      </div>
      <div className="border-t border-border px-4 py-2">
        <p className="font-mono text-[12px] italic text-muted-foreground">
          Value and weighted value by capture stage. Click a bar to filter the list below.
        </p>
      </div>
    </div>
  );
}
