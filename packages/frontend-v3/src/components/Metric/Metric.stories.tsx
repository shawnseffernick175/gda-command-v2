import type { Meta, StoryObj } from '@storybook/react';
import { Metric } from './Metric';

const meta: Meta<typeof Metric> = { component: Metric, title: 'Primitives/Metric' };
export default meta;
type Story = StoryObj<typeof Metric>;

export const Default: Story = { args: { label: 'Win Rate', value: '68%', sourceUrl: 'https://sam.gov/report/789' } };
export const WithTrend: Story = { args: { label: 'Pipeline Growth', value: '+12.3', unit: '%', trend: 'up', sourceUrl: 'https://fpds.gov/456' } };
export const TrendDown: Story = { args: { label: 'Time to Award', value: '142', unit: 'days', trend: 'down', sourceUrl: 'https://usaspending.gov/789' } };
