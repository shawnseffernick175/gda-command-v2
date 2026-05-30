import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { FunnelChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CaptureStageData } from '../types';
import { SourceUrlChip } from '../components/SourceUrlChip/SourceUrlChip';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { stageColors } from '../lib/tokens';

echarts.use([FunnelChart, TooltipComponent, LegendComponent, CanvasRenderer]);

interface Props {
  data: CaptureStageData;
}

export function CaptureStageFunnelChart({ data }: Props) {
  const total = data.stages.reduce((s, st) => s + st.count, 0);
  if (total === 0) {
    return <EmptyState title="No capture data available." />;
  }

  const option: echarts.EChartsCoreOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; data: { conversionRate: number; totalValue: number } };
        return `${p.name} — ${p.value} opps ($${(p.data.totalValue / 1e6).toFixed(1)}M) — ${p.data.conversionRate}% conversion`;
      },
    },
    series: [
      {
        type: 'funnel',
        left: '10%',
        width: '80%',
        min: 0,
        max: Math.max(...data.stages.map((s) => s.count)),
        sort: 'descending',
        data: data.stages.map((s) => ({
          name: s.label,
          value: s.count,
          totalValue: s.totalValue,
          conversionRate: s.conversionRate,
          itemStyle: { color: stageColors[String(s.stage) as keyof typeof stageColors] ?? stageColors['0'] },
        })),
      },
    ],
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-ink-primary mb-4">Capture Funnel — {total} Opportunities</h3>
      <ReactEChartsCore echarts={echarts} option={option} theme="gda-dark" style={{ height: 400 }} />
      {data.sourceRefs.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {data.sourceRefs.map((src, i) => (
            <SourceUrlChip key={i} url={src.url} source_kind={src.kind} retrieved_at={new Date().toISOString()} data-testid={`data-point-funnel-${i}`} />
          ))}
        </div>
      )}
    </div>
  );
}
