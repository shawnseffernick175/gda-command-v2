import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { SourceRef } from "../components/AgentRecommendationCard/AgentRecommendationCard";
import { SourceUrlChip } from "../components/SourceUrlChip/SourceUrlChip";
import { stageColors } from "../lib/stage-colors";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export interface WinProbDistributionData {
  buckets: {
    range: string;
    rangeMin: number;
    rangeMax: number;
    items: { stage: number; count: number; totalValue: number }[];
  }[];
  sourceRefs: SourceRef[];
}

export interface WinProbabilityDistributionChartProps {
  data: WinProbDistributionData;
}



export function WinProbabilityDistributionChart({ data }: WinProbabilityDistributionChartProps) {
  if (data.buckets.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-ink-muted">
        No opportunities with pwin estimates.
      </div>
    );
  }

  const stages = Array.from(
    new Set(data.buckets.flatMap((b) => b.items.map((i) => i.stage)))
  ).sort();

  const series = stages.map((stage) => ({
    name: `Stage ${stage}`,
    type: "bar" as const,
    stack: "total",
    data: data.buckets.map((b) => b.items.find((i) => i.stage === stage)?.count ?? 0),
    itemStyle: { color: stageColors[stage] ?? stageColors[0] },
  }));

  const option = {
    tooltip: { trigger: "axis" as const },
    legend: { data: stages.map((s) => `Stage ${s}`) },
    xAxis: { type: "category" as const, data: data.buckets.map((b) => b.range) },
    yAxis: { type: "value" as const, name: "Count" },
    series,
  };

  return (
    <div>
      <ReactEChartsCore echarts={echarts} option={option} theme="gda-dark" style={{ height: 300 }} />
      <div className="flex flex-wrap gap-2 mt-2">
        {data.sourceRefs.map((s) => (
          <SourceUrlChip key={s.url} url={s.url} source_kind={s.kind} retrieved_at={new Date().toISOString()} label={s.label} />
        ))}
      </div>
    </div>
  );
}
