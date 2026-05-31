import type { Meta, StoryObj } from '@storybook/react';
import { HistoryList } from './HistoryList';
import type { FastTrackResult } from './types';

const mockItems: FastTrackResult[] = [
  {
    id: 'ft-001',
    grade: 'A',
    rationale: 'Strong match.',
    naics_match_score: 87,
    recommended_action: 'pursue',
    source_chips: [{ kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/1', retrieved_at: '2026-05-30T12:00:00Z' }],
    model_used: 'claude-sonnet-4-5',
    generated_at: new Date(Date.now() - 120000).toISOString(),
    cache_hit: false,
  },
  {
    id: 'ft-002',
    grade: 'B',
    rationale: 'Moderate match.',
    naics_match_score: 55,
    recommended_action: 'watch',
    source_chips: [{ kind: 'internal', title: 'GDA V3', url: '/v3/internal', retrieved_at: '2026-05-30T11:00:00Z' }],
    model_used: 'claude-sonnet-4-5',
    generated_at: new Date(Date.now() - 3600000).toISOString(),
    cache_hit: false,
  },
  {
    id: 'ft-003',
    grade: 'C',
    rationale: 'Weak match.',
    naics_match_score: 22,
    recommended_action: 'skip',
    source_chips: [{ kind: 'fpds', title: 'FPDS', url: 'https://fpds.gov/1', retrieved_at: '2026-05-30T10:00:00Z' }],
    model_used: 'claude-sonnet-4-5',
    generated_at: new Date(Date.now() - 86400000).toISOString(),
    cache_hit: false,
  },
];

const meta: Meta<typeof HistoryList> = {
  title: 'Surfaces/FastTrack/HistoryList',
  component: HistoryList,
  decorators: [
    (Story) => (
      <div className="bg-canvas p-6 max-w-2xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof HistoryList>;

export const WithItems: Story = {
  args: {
    items: mockItems,
    isLoading: false,
    nextCursor: 'cursor-abc',
    onLoadMore: () => {},
    onSelect: () => {},
  },
};

export const Empty: Story = {
  args: {
    items: [],
    isLoading: false,
    nextCursor: null,
    onLoadMore: () => {},
    onSelect: () => {},
  },
};

export const Loading: Story = {
  args: {
    items: [],
    isLoading: true,
    nextCursor: null,
    onLoadMore: () => {},
    onSelect: () => {},
  },
};
