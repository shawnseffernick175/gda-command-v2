import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Launchpad } from './Launchpad';

const meta: Meta<typeof Launchpad> = {
  title: 'Surfaces/Launchpad/Launchpad',
  component: Launchpad,
  decorators: [
    (Story) => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      return (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/launchpad']}>
            <div className="bg-canvas p-6 min-h-screen">
              <Story />
            </div>
          </MemoryRouter>
        </QueryClientProvider>
      );
    },
  ],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof Launchpad>;

export const Default: Story = {};
