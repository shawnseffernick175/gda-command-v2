import type { Meta, StoryObj } from '@storybook/react';
import { Inspector } from './Inspector';

const meta: Meta<typeof Inspector> = { component: Inspector, title: 'Primitives/Inspector' };
export default meta;
type Story = StoryObj<typeof Inspector>;

export const Default: Story = {
  args: {
    open: true,
    title: 'Opportunity Detail',
    onClose: () => {},
    children: <div className="text-sm text-ink-primary">Inspector panel content — 400px default, resizable 320-560px, persisted to localStorage.</div>,
  },
};
