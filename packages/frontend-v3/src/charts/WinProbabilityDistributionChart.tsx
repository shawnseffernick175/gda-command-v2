import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { WinProbDistributionData } from '../types';
import { SourceUrlChip } from '../components/SourceUrlChip/SourceUrlChip';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { stageColors } from '../lib/tokens';

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const STAGE_NAMES: Record<number, string> = {
  0: 'Long Term Positioning', 1: 'Opp Assessment', 2: 'Capture Planning',
  3: 'Proposal Planning', 4: 'Proposal Dev', 5: 'Post-Submittal', 6: 'Post-Award',
};

interface Props {
  data: WinProbDistributionData;
}

export function WinProbabilityDistributionChart({ data }: Props) {
  const total = data.buckets.reduce((s, b) => s + b.items.reduce((ss, i) => ss + i.count, 0), 0);
  if (total === 0) {
    return <EmptyState title="No opportunities with pwin estimates." />;
  }

  const stagesPresent = new Set<number>();
  data.buckets.forEach((b) => b.items.forEach((i) => stagesPresent.add(i.stage)));
  const stages = Array.from(stagesPresent).sort();

  const series = stages.map((stage) => ({
    name: STAGE_NAMES[stage] ?? `Stage ${stage}`,
    type: 'bar' as const,
    stack: 'total',
    data: data.buckets.map((b) => b.items.find((i) => i.stage === stage)?.count ?? 0),
    itemStyle: { color: stageColors[String(stage) as keyof typeof stageColors] ?? stageColors['0'] },
  }));

  const option: echarts.EChartsCoreOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: stages.map((s) => STAGE_NAMES[s] ?? `Stage ${s}`) },
    xAxis: { type: 'category', data: data.buckets.map((b) => b.range) },
    yAxis: { type: 'value', name: 'Count' },
    series,
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-ink-primary mb-4">Win-Probability Distribution — {total} Opportunities</h3>
      <ReactEChartsCore echarts={echarts} option={option} theme="gda-dark" style={{ height: 320 }} />
      {data.sourceRefs.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {data.sourceRefs.map((src, i) => (
            <SourceUrlChip key={i} url={src.url} source_kind={src.kind} retrieved_at={new Date().toISOString()} data-testid={`data-point-winprob-${i}`} />
          ))}
        </div>
      )}
    </div>
  );
}
