import type { Meta, StoryObj } from '@storybook/react';
import { IconButton } from './IconButton';

const meta: Meta<typeof IconButton> = { component: IconButton, title: 'Primitives/IconButton' };
export default meta;
type Story = StoryObj<typeof IconButton>;

export const Default: Story = { args: { icon: <span>×</span>, 'aria-label': 'Close' } };
export const Secondary: Story = { args: { icon: <span>×</span>, 'aria-label': 'Close', variant: 'secondary' } };
export const Disabled: Story = { args: { icon: <span>×</span>, 'aria-label': 'Close', disabled: true } };
