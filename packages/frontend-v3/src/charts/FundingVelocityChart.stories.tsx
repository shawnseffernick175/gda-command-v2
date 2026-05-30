import type { Meta, StoryObj } from '@storybook/react';
import { FundingVelocityChart } from './FundingVelocityChart';

const meta: Meta<typeof FundingVelocityChart> = { component: FundingVelocityChart, title: 'Charts/FundingVelocityChart' };
export default meta;
type Story = StoryObj<typeof FundingVelocityChart>;

export const Default: Story = {
  args: {
    data: {
      periods: [
        { label: 'Q1', currentFY: 25000000, priorFY: 20000000 },
        { label: 'Q2', currentFY: 32000000, priorFY: 28000000 },
        { label: 'Q3', currentFY: 18000000, priorFY: 22000000 },
        { label: 'Q4', currentFY: 41000000, priorFY: 35000000 },
      ],
      naicsFilter: ['541330'],
      sourceRefs: [{ url: 'https://usaspending.gov/report/funding-fy25', kind: 'usaspending', label: 'USAspending FY25' }],
    },
  },
};
