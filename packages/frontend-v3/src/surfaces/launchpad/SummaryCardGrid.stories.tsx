import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { SummaryCardGrid } from './SummaryCardGrid';
import type { LaunchpadSummary } from './types';

const mockData: LaunchpadSummary = {
  qualified_due_this_week: 7,
  qualified_due_this_week_sources: [{ kind: 'internal', title: 'GDA V3 — qualified count', url: '/v3/opportunities?status=qualified', retrieved_at: '2026-05-30T12:00:00Z' }],
  pipeline_no_capture: 2,
  pipeline_no_capture_sources: [{ kind: 'internal', title: 'GDA V3 — pipeline count', url: '/v3/pipeline?no_capture=1', retrieved_at: '2026-05-30T12:00:00Z' }],
  captures_color_review_stale: 3,
  captures_color_review_stale_sources: [{ kind: 'internal', title: 'GDA V3 — stale reviews', url: '/v3/captures?stale_review=1', retrieved_at: '2026-05-30T12:00:00Z' }],
  action_items_open_today: 5,
  action_items_open_today_sources: [{ kind: 'internal', title: 'GDA V3 — open today', url: '/v3/action-items?status=open&due=today', retrieved_at: '2026-05-30T12:00:00Z' }],
  action_items_overdue: 1,
  action_items_overdue_sources: [{ kind: 'internal', title: 'GDA V3 — overdue', url: '/v3/action-items?status=open&overdue=1', retrieved_at: '2026-05-30T12:00:00Z' }],
};

const meta: Meta<typeof SummaryCardGrid> = {
  title: 'Surfaces/Launchpad/SummaryCardGrid',
  component: SummaryCardGrid,
  decorators: [(Story) => <MemoryRouter><Story /></MemoryRouter>],
};

export default meta;
type Story = StoryObj<typeof SummaryCardGrid>;

export const Default: Story = {
  args: { data: mockData, isLoading: false, isError: false, error: null, refetch: () => {} },
};

export const Loading: Story = {
  args: { data: undefined, isLoading: true, isError: false, error: null, refetch: () => {} },
};

export const Error: Story = {
  args: { data: undefined, isLoading: false, isError: true, error: new globalThis.Error('Network timeout'), refetch: () => {} },
};

export const AllZero: Story = {
  args: {
    data: {
      ...mockData,
      qualified_due_this_week: 0,
      pipeline_no_capture: 0,
      captures_color_review_stale: 0,
      action_items_open_today: 0,
      action_items_overdue: 0,
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => {},
  },
};
