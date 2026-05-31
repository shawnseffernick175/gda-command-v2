import type { Meta, StoryObj } from '@storybook/react';
import { SourceUrlChip } from './SourceUrlChip';

const meta: Meta<typeof SourceUrlChip> = { component: SourceUrlChip, title: 'Primitives/SourceUrlChip' };
export default meta;
type Story = StoryObj<typeof SourceUrlChip>;

export const Default: Story = { args: { url: 'https://sam.gov/opp/abc123', source_kind: 'sam_gov', retrieved_at: new Date().toISOString() } };
export const WithLabel: Story = { args: { url: 'https://fpds.gov/report/456', source_kind: 'fpds', retrieved_at: new Date(Date.now() - 3600000).toISOString(), label: 'FPDS Report' } };
export const DrillDown: Story = { args: { url: '/opportunities?status=qualified&due=this_week', source_kind: 'internal', retrieved_at: new Date().toISOString(), label: 'Opportunities (qualified, due this week)' } };
