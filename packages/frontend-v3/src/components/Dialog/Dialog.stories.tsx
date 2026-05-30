import type { Meta, StoryObj } from '@storybook/react';
import { Dialog } from './Dialog';

const meta: Meta<typeof Dialog> = { component: Dialog, title: 'Primitives/Dialog' };
export default meta;
type Story = StoryObj<typeof Dialog>;

export const Default: Story = {
  args: {
    open: true,
    title: 'Confirm Action',
    children: 'Are you sure you want to promote this signal to an opportunity?',
    onClose: () => {},
  },
};
