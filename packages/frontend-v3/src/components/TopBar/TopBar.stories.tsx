import type { Meta, StoryObj } from '@storybook/react';
import { TopBar } from './TopBar';

const meta: Meta<typeof TopBar> = {
  title: 'Layout/TopBar',
  component: TopBar,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof TopBar>;

export const Default: Story = {
  render: () => <TopBar />,
};

export const WithActions: Story = {
  render: () => (
    <TopBar>
      <button type="button" className="text-sm text-ink-muted hover:text-ink-primary px-2">Help</button>
      <button type="button" className="text-sm text-ink-muted hover:text-ink-primary px-2">Settings</button>
      <span className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-medium text-ink-primary">JS</span>
    </TopBar>
  ),
};

export const LightTheme: Story = {
  render: () => {
    document.documentElement.setAttribute('data-theme', 'light');
    return (
      <TopBar>
        <span className="text-sm text-ink-muted">Light Mode</span>
      </TopBar>
    );
  },
};
