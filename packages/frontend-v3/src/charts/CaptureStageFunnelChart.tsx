import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { FunnelChart } from "echarts/charts";
import { TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { SourceRef } from "../components/AgentRecommendationCard/AgentRecommendationCard";
import { SourceUrlChip } from "../components/SourceUrlChip/SourceUrlChip";
import { stageColors } from "../lib/stage-colors";

echarts.use([FunnelChart, TooltipComponent, LegendComponent, CanvasRenderer]);

export interface CaptureStageData {
  stages: {
    stage: number;
    label: string;
    count: number;
    totalValue: number;
    conversionRate: number;
  }[];
  sourceRefs: SourceRef[];
}

export interface CaptureStageFunnelChartProps {
  data: CaptureStageData;
}

export function CaptureStageFunnelChart({ data }: CaptureStageFunnelChartProps) {
  if (data.stages.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-ink-muted">
        No capture data available.
      </div>
    );
  }

  const option = {
    tooltip: {
      trigger: "item" as const,
      formatter: (params: { name: string; value: number; dataIndex: number }) => {
        const stage = data.stages[params.dataIndex];
        if (!stage) return "";
        return `Stage ${stage.stage}: ${stage.label} — ${stage.count} opps ($${(stage.totalValue / 1e6).toFixed(1)}M) — ${stage.conversionRate}% conversion`;
      },
    },
    series: [
      {
        type: "funnel" as const,
        left: "10%",
        width: "80%",
        sort: "descending" as const,
        data: data.stages.map((s) => ({
          name: s.label,
          value: s.count,
          itemStyle: { color: stageColors[s.stage] ?? stageColors[0] },
        })),
      },
    ],
  };

  return (
    <div>
      <ReactEChartsCore echarts={echarts} option={option} theme="gda-dark" style={{ height: 400 }} />
      <div className="flex flex-wrap gap-2 mt-2">
        {data.sourceRefs.map((s) => (
          <SourceUrlChip key={s.url} url={s.url} source_kind={s.kind} retrieved_at={new Date().toISOString()} label={s.label} />
        ))}
      </div>
    </div>
  );
}
