import type { Meta, StoryObj } from '@storybook/react';
import { Popover } from './Popover';
import { Button } from '../Button/Button';

const meta: Meta<typeof Popover> = { component: Popover, title: 'Primitives/Popover' };
export default meta;
type Story = StoryObj<typeof Popover>;

export const Default: Story = {
  args: {
    content: <div className="text-sm text-ink-primary">Popover content</div>,
    children: <Button variant="secondary">Toggle</Button>,
  },
};
