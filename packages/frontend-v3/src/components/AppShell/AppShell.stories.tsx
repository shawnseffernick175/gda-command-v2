import type { Meta, StoryObj } from '@storybook/react';
import { AppShell } from './AppShell';
import { LeftRail } from '../LeftRail/LeftRail';
import { MainCanvas } from '../MainCanvas/MainCanvas';

const meta: Meta<typeof AppShell> = {
  title: 'Layout/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof AppShell>;

export const Default: Story = {
  render: () => (
    <AppShell>
      <LeftRail>
        <div className="px-2 py-1 text-sm text-ink-muted">Nav Item 1</div>
        <div className="px-2 py-1 text-sm text-ink-muted">Nav Item 2</div>
      </LeftRail>
      <MainCanvas>
        <h1 className="text-xl font-semibold">Main Content Area</h1>
        <p className="text-ink-muted mt-2">This is the default AppShell layout with TopBar, LeftRail, and MainCanvas.</p>
      </MainCanvas>
    </AppShell>
  ),
};

export const WithContent: Story = {
  render: () => (
    <AppShell>
      <LeftRail>
        <div className="px-2 py-1 text-sm text-accent font-medium">Dashboard</div>
        <div className="px-2 py-1 text-sm text-ink-muted">Opportunities</div>
        <div className="px-2 py-1 text-sm text-ink-muted">Reports</div>
        <div className="px-2 py-1 text-sm text-ink-muted">Settings</div>
      </LeftRail>
      <MainCanvas>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="p-4 rounded-md border border-border bg-surface">Card 1</div>
          <div className="p-4 rounded-md border border-border bg-surface">Card 2</div>
          <div className="p-4 rounded-md border border-border bg-surface">Card 3</div>
        </div>
      </MainCanvas>
    </AppShell>
  ),
};

export const LightTheme: Story = {
  render: () => {
    document.documentElement.setAttribute('data-theme', 'light');
    return (
      <AppShell>
        <LeftRail>
          <div className="px-2 py-1 text-sm text-ink-muted">Nav Item</div>
        </LeftRail>
        <MainCanvas>
          <h1 className="text-xl font-semibold">Light Theme</h1>
          <p className="text-ink-muted mt-2">AppShell in light theme mode.</p>
        </MainCanvas>
      </AppShell>
    );
  },
};
