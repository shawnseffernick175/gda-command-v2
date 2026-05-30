import type { Meta, StoryObj } from '@storybook/react';
import { Tabs } from './Tabs';

const meta: Meta<typeof Tabs> = { component: Tabs, title: 'Primitives/Tabs' };
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  args: {
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'details', label: 'Details' },
      { id: 'history', label: 'History' },
    ],
    activeId: 'overview',
    onChange: () => {},
  },
};
