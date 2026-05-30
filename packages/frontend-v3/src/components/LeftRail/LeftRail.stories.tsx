import type { Meta, StoryObj } from '@storybook/react';
import { LeftRail } from './LeftRail';
import { useState } from 'react';

const meta: Meta<typeof LeftRail> = {
  title: 'Layout/LeftRail',
  component: LeftRail,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-screen bg-canvas text-ink-primary">
        <Story />
        <div className="flex-1 p-4">Main content area</div>
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof LeftRail>;

export const Default: Story = {
  render: () => (
    <LeftRail>
      <div className="px-2 py-1 text-sm text-accent font-medium">Dashboard</div>
      <div className="px-2 py-1 text-sm text-ink-muted">Opportunities</div>
      <div className="px-2 py-1 text-sm text-ink-muted">Reports</div>
    </LeftRail>
  ),
};

export const Collapsed: Story = {
  render: () => (
    <LeftRail collapsed>
      <div className="px-2 py-1 text-sm text-accent font-medium">D</div>
      <div className="px-2 py-1 text-sm text-ink-muted">O</div>
      <div className="px-2 py-1 text-sm text-ink-muted">R</div>
    </LeftRail>
  ),
};

function ToggleableLeftRail() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <LeftRail collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)}>
      {!collapsed && (
        <>
          <div className="px-2 py-1 text-sm text-accent font-medium">Dashboard</div>
          <div className="px-2 py-1 text-sm text-ink-muted">Opportunities</div>
          <div className="px-2 py-1 text-sm text-ink-muted">Reports</div>
        </>
      )}
    </LeftRail>
  );
}

export const WithToggle: Story = {
  render: () => <ToggleableLeftRail />,
};
