import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { SourceRef } from "../components/AgentRecommendationCard/AgentRecommendationCard";
import { SourceUrlChip } from "../components/SourceUrlChip/SourceUrlChip";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export interface FundingVelocityData {
  periods: {
    label: string;
    currentFY: number;
    priorFY: number;
  }[];
  naicsFilter: string[];
  sourceRefs: SourceRef[];
}

export interface FundingVelocityChartProps {
  data: FundingVelocityData;
  currentFYLabel?: string;
  priorFYLabel?: string;
}

export function FundingVelocityChart({
  data,
  currentFYLabel = "FY26",
  priorFYLabel = "FY25",
}: FundingVelocityChartProps) {
  if (data.periods.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-ink-muted">
        No funding data available for selected NAICS codes.
      </div>
    );
  }

  const option = {
    tooltip: {
      trigger: "axis" as const,
      formatter: (params: Array<{ name: string; value: number; seriesName: string }>) => {
        const p = params[0];
        if (!p) return "";
        const current = params.find((x) => x.seriesName === currentFYLabel)?.value ?? 0;
        const prior = params.find((x) => x.seriesName === priorFYLabel)?.value ?? 0;
        const delta = prior > 0 ? (((current - prior) / prior) * 100).toFixed(1) : "N/A";
        return `${p.name}: $${(current / 1e6).toFixed(1)}M (${currentFYLabel}) / $${(prior / 1e6).toFixed(1)}M (${priorFYLabel}) — ${delta}% change`;
      },
    },
    legend: { data: [currentFYLabel, priorFYLabel] },
    xAxis: { type: "category" as const, data: data.periods.map((p) => p.label) },
    yAxis: { type: "value" as const, axisLabel: { formatter: (v: number) => `$${(v / 1e6).toFixed(1)}M` } },
    series: [
      { name: currentFYLabel, type: "bar" as const, data: data.periods.map((p) => p.currentFY) },
      { name: priorFYLabel, type: "bar" as const, data: data.periods.map((p) => p.priorFY) },
    ],
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
