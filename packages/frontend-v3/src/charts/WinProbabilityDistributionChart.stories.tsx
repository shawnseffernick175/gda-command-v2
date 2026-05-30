import type { Meta, StoryObj } from '@storybook/react';
import { WinProbabilityDistributionChart } from './WinProbabilityDistributionChart';

const meta: Meta<typeof WinProbabilityDistributionChart> = { component: WinProbabilityDistributionChart, title: 'Charts/WinProbabilityDistributionChart' };
export default meta;
type Story = StoryObj<typeof WinProbabilityDistributionChart>;

export const Default: Story = {
  args: {
    data: {
      buckets: [
        { range: '0-10%', rangeMin: 0, rangeMax: 10, items: [{ stage: 0, count: 5, totalValue: 3000000 }] },
        { range: '10-20%', rangeMin: 10, rangeMax: 20, items: [{ stage: 1, count: 8, totalValue: 12000000 }] },
        { range: '20-30%', rangeMin: 20, rangeMax: 30, items: [{ stage: 2, count: 12, totalValue: 18000000 }] },
        { range: '30-40%', rangeMin: 30, rangeMax: 40, items: [{ stage: 2, count: 6, totalValue: 9000000 }, { stage: 3, count: 4, totalValue: 8000000 }] },
        { range: '40-50%', rangeMin: 40, rangeMax: 50, items: [{ stage: 3, count: 3, totalValue: 7000000 }] },
        { range: '50-60%', rangeMin: 50, rangeMax: 60, items: [{ stage: 4, count: 2, totalValue: 5000000 }] },
      ],
      sourceRefs: [{ url: 'https://sam.gov/opp/pwin-dist', kind: 'sam_gov' }],
    },
  },
};
