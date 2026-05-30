import type { Meta, StoryObj } from '@storybook/react';
import { CommandPalette } from './CommandPalette';

const meta: Meta<typeof CommandPalette> = { component: CommandPalette, title: 'Primitives/CommandPalette' };
export default meta;
type Story = StoryObj<typeof CommandPalette>;

export const Default: Story = {
  args: {
    open: true,
    onClose: () => {},
    onExecute: () => {},
    commands: [
      {
        label: 'Navigation',
        commands: [
          { id: '1', label: 'Go to Launchpad', shortcut: 'G L', action: () => {} },
          { id: '2', label: 'Go to Pipeline', shortcut: 'G P', action: () => {} },
          { id: '3', label: 'Go to Fast Track', shortcut: 'G F', action: () => {} },
        ],
      },
      {
        label: 'Actions',
        commands: [
          { id: '4', label: 'New Opportunity', shortcut: 'N O', action: () => {} },
          { id: '5', label: 'Search', shortcut: '/', action: () => {} },
        ],
      },
    ],
  },
};
