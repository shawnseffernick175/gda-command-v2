import type { Meta, StoryObj } from '@storybook/react';
import { TimeoutBanner } from './TimeoutBanner';

const meta: Meta<typeof TimeoutBanner> = {
  title: 'Surfaces/FastTrack/TimeoutBanner',
  component: TimeoutBanner,
  decorators: [
    (Story) => (
      <div className="bg-canvas p-6 max-w-2xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TimeoutBanner>;

export const Default: Story = {
  args: {
    onRetry: () => {},
    onCancel: () => {},
  },
};
