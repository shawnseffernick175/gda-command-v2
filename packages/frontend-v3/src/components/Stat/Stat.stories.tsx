import type { Meta, StoryObj } from '@storybook/react';
import { Stat } from './Stat';

const meta: Meta<typeof Stat> = { component: Stat, title: 'Primitives/Stat' };
export default meta;
type Story = StoryObj<typeof Stat>;

export const Default: Story = { args: { label: 'Pipeline Value', value: '$12.4M', sourceUrl: 'https://sam.gov/opp/123', sourceKind: 'sam_gov' } };
export const Numeric: Story = { args: { label: 'Active Pursuits', value: 47, sourceUrl: 'https://fpds.gov/report/456' } };
