import type { Meta, StoryObj } from '@storybook/react';
import { Tooltip } from './Tooltip';

const meta: Meta<typeof Tooltip> = { component: Tooltip, title: 'Primitives/Tooltip' };
export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = { args: { content: 'More information', children: <span className="text-sm text-ink-primary underline">Hover me</span> } };
