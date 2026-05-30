import type { Meta, StoryObj } from '@storybook/react';
import { SourceKindContributionChart } from './SourceKindContributionChart';

const meta: Meta<typeof SourceKindContributionChart> = { component: SourceKindContributionChart, title: 'Charts/SourceKindContributionChart' };
export default meta;
type Story = StoryObj<typeof SourceKindContributionChart>;

export const Default: Story = {
  args: {
    data: {
      periods: [
        { label: 'Jan', sources: [{ kind: 'sam_gov', count: 15, qualified: 8, value: 12000000 }, { kind: 'fpds', count: 6, qualified: 3, value: 5000000 }] },
        { label: 'Feb', sources: [{ kind: 'sam_gov', count: 22, qualified: 11, value: 18000000 }, { kind: 'fpds', count: 9, qualified: 5, value: 7000000 }] },
        { label: 'Mar', sources: [{ kind: 'sam_gov', count: 18, qualified: 9, value: 14000000 }, { kind: 'news', count: 4, qualified: 2, value: 3000000 }] },
      ],
      sourceRefs: [{ url: 'https://sam.gov/opp/source-kinds', kind: 'sam_gov' }],
    },
  },
};
