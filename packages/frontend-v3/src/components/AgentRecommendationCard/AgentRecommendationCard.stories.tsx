import type { Meta, StoryObj } from '@storybook/react';
import { AgentRecommendationCard } from './AgentRecommendationCard';

const meta: Meta<typeof AgentRecommendationCard> = { component: AgentRecommendationCard, title: 'Primitives/AgentRecommendationCard' };
export default meta;
type Story = StoryObj<typeof AgentRecommendationCard>;

export const Pending: Story = {
  args: {
    recommendation: 'This opportunity aligns with NAICS 541330 and your past performance in DOD contracts.',
    confidence: 'high',
    sources: [{ url: 'https://sam.gov/opp/abc123', kind: 'sam_gov', label: 'SAM.gov' }],
    reasoning: 'Based on NAICS code match, agency history, and contract value alignment.',
    onApprove: () => {},
    onReject: () => {},
  },
};

export const Approved: Story = {
  args: {
    ...Pending.args,
    status: 'approved',
  },
};

export const Rejected: Story = {
  args: {
    ...Pending.args,
    status: 'rejected',
  },
};
