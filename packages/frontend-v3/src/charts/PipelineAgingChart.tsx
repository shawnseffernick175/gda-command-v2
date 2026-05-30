import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { SourceRef } from "../components/AgentRecommendationCard/AgentRecommendationCard";
import { SourceUrlChip } from "../components/SourceUrlChip/SourceUrlChip";
import { colors } from "../lib/tokens";

echarts.use([BarChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

export interface PipelineAgingData {
  items: {
    id: string;
    title: string;
    stage: number;
    daysInStage: number;
    threshold: number;
    value: number;
  }[];
  sourceRefs: SourceRef[];
}

export interface PipelineAgingChartProps {
  data: PipelineAgingData;
}

export function PipelineAgingChart({ data }: PipelineAgingChartProps) {
  if (data.items.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-ink-muted">
        No active pipeline items.
      </div>
    );
  }

  const sorted = [...data.items].sort((a, b) => b.daysInStage - a.daysInStage);
  const meanThreshold = sorted.reduce((s, i) => s + i.threshold, 0) / sorted.length;

  const option = {
    tooltip: {
      trigger: "axis" as const,
      formatter: (params: Array<{ name: string; value: number; dataIndex: number }>) => {
        const p = params[0];
        if (!p) return "";
        const item = sorted[p.dataIndex];
        if (!item) return "";
        return `${item.title} — Stage ${item.stage}: ${item.daysInStage} days (threshold: ${item.threshold}d) — est. $${(item.value / 1e6).toFixed(1)}M`;
      },
    },
    grid: { left: 200 },
    xAxis: { type: "value" as const, name: "Days in Stage" },
    yAxis: {
      type: "category" as const,
      data: sorted.map((i) => i.title.slice(0, 40)),
      axisLabel: { width: 180, overflow: "truncate" as const },
    },
    series: [
      {
        type: "bar" as const,
        data: sorted.map((i) => ({
          value: i.daysInStage,
          itemStyle: {
            color:
              i.daysInStage > i.threshold
                ? colors.dark.critical
                : i.daysInStage >= i.threshold
                  ? colors.dark.warning
                  : colors.dark.accent,
          },
        })),
        markLine: {
          data: [{ xAxis: meanThreshold, name: "Mean Threshold" }],
          label: { formatter: "Avg Threshold" },
        },
      },
    ],
  };

  return (
    <div>
      <ReactEChartsCore echarts={echarts} option={option} theme="gda-dark" style={{ height: Math.max(300, sorted.length * 36) }} />
      <div className="flex flex-wrap gap-2 mt-2">
        {data.sourceRefs.map((s) => (
          <SourceUrlChip key={s.url} url={s.url} source_kind={s.kind} retrieved_at={new Date().toISOString()} label={s.label} />
        ))}
      </div>
    </div>
  );
}
