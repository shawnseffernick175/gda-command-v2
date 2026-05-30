import type { Meta, StoryObj } from '@storybook/react';
import { PipelineAgingChart } from './PipelineAgingChart';

const meta: Meta<typeof PipelineAgingChart> = { component: PipelineAgingChart, title: 'Charts/PipelineAgingChart' };
export default meta;
type Story = StoryObj<typeof PipelineAgingChart>;

export const Default: Story = {
  args: {
    data: {
      items: [
        { id: '1', title: 'DOD Cloud Migration', stage: 2, daysInStage: 45, threshold: 30, value: 2500000 },
        { id: '2', title: 'VA Health IT Modernization', stage: 3, daysInStage: 12, threshold: 21, value: 4800000 },
        { id: '3', title: 'USAF Cyber Defense', stage: 1, daysInStage: 8, threshold: 14, value: 1200000 },
      ],
      sourceRefs: [{ url: 'https://sam.gov/opp/pipeline', kind: 'sam_gov' }],
    },
  },
};
