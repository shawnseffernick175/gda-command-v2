import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { ResultPanel } from './ResultPanel';
import type { FastTrackResult } from './types';

const mockResult: FastTrackResult = {
  id: 'ft-001',
  grade: 'A',
  rationale: 'Strong alignment with NAICS 541330 — logistics and sustainment scope matches Envision core.\n\nPast performance on RS3 directly relevant. Set-aside qualifies under SDB.',
  naics_match_score: 87,
  recommended_action: 'pursue',
  source_chips: [
    { kind: 'sam_gov', title: 'SAM.gov listing', url: 'https://sam.gov/opp/123', retrieved_at: '2026-05-30T12:00:00Z' },
    { kind: 'fpds', title: 'FPDS award history', url: 'https://fpds.gov/award/456', retrieved_at: '2026-05-30T11:00:00Z' },
    { kind: 'doctrine', title: 'GDA doctrine §4.2', url: '/docs/doctrine#4.2', retrieved_at: '2026-05-30T10:00:00Z' },
  ],
  model_used: 'claude-sonnet-4-5',
  generated_at: new Date(Date.now() - 120000).toISOString(),
  cache_hit: true,
};

const meta: Meta<typeof ResultPanel> = {
  title: 'Surfaces/FastTrack/ResultPanel',
  component: ResultPanel,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="bg-canvas p-6 max-w-2xl">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ResultPanel>;

export const GradeA: Story = {
  args: { result: mockResult },
};

export const GradeB: Story = {
  args: {
    result: { ...mockResult, grade: 'B', recommended_action: 'watch', naics_match_score: 55 },
  },
};

export const GradeC: Story = {
  args: {
    result: { ...mockResult, grade: 'C', recommended_action: 'skip', naics_match_score: 23 },
  },
};
