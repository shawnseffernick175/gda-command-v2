import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { SourceKind } from "../components/SourceUrlChip/SourceUrlChip";
import type { SourceRef } from "../components/AgentRecommendationCard/AgentRecommendationCard";
import { SourceUrlChip } from "../components/SourceUrlChip/SourceUrlChip";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export interface SourceKindContributionData {
  periods: {
    label: string;
    sources: {
      kind: SourceKind;
      count: number;
      qualified: number;
      value: number;
    }[];
  }[];
  sourceRefs: SourceRef[];
}

export interface SourceKindContributionChartProps {
  data: SourceKindContributionData;
}

export function SourceKindContributionChart({ data }: SourceKindContributionChartProps) {
  if (data.periods.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-ink-muted">
        No source data for the selected period.
      </div>
    );
  }

  const allKinds = Array.from(
    new Set(data.periods.flatMap((p) => p.sources.map((s) => s.kind)))
  );

  const series = allKinds.map((kind) => ({
    name: kind,
    type: "bar" as const,
    stack: "total",
    data: data.periods.map(
      (p) => p.sources.find((s) => s.kind === kind)?.count ?? 0
    ),
  }));

  const option = {
    tooltip: { trigger: "axis" as const },
    legend: { data: allKinds },
    xAxis: { type: "category" as const, data: data.periods.map((p) => p.label) },
    yAxis: { type: "value" as const, name: "Opportunities" },
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
