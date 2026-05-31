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

export const WithUser: Story = {
  render: () => {
    localStorage.setItem('gda_v3_user', JSON.stringify({
      id: 1, email: 'admin@gda.local', display_name: 'Jane Smith', role: 'admin',
    }));
    return <TopBar />;
  },
};

export const LightTheme: Story = {
  render: () => {
    document.documentElement.setAttribute('data-theme', 'light');
    return <TopBar />;
  },
};
