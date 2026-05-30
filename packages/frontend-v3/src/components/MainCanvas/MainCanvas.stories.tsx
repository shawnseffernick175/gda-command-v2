import type { Meta, StoryObj } from '@storybook/react';
import { MainCanvas } from './MainCanvas';

const meta: Meta<typeof MainCanvas> = {
  title: 'Layout/MainCanvas',
  component: MainCanvas,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen bg-canvas text-ink-primary">
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof MainCanvas>;

export const Default: Story = {
  render: () => (
    <MainCanvas>
      <h1 className="text-xl font-semibold">Main Canvas</h1>
      <p className="text-ink-muted mt-2">Default content area with max-width constraint and padding.</p>
    </MainCanvas>
  ),
};

export const WithContent: Story = {
  render: () => (
    <MainCanvas>
      <h1 className="text-xl font-semibold">Opportunity Detail</h1>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="p-4 rounded-md border border-border bg-surface">
          <h2 className="text-sm font-medium text-ink-muted mb-2">Contract Value</h2>
          <span className="text-2xl font-semibold">$12.4M</span>
        </div>
        <div className="p-4 rounded-md border border-border bg-surface">
          <h2 className="text-sm font-medium text-ink-muted mb-2">Stage</h2>
          <span className="text-2xl font-semibold">Capture Planning</span>
        </div>
      </div>
    </MainCanvas>
  ),
};
