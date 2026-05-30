import type { Meta, StoryObj } from '@storybook/react';
import { Toast } from './Toast';

const meta: Meta<typeof Toast> = { component: Toast, title: 'Primitives/Toast' };
export default meta;
type Story = StoryObj<typeof Toast>;

export const Info: Story = { args: { severity: 'info', message: 'Opportunity saved.' } };
export const Success: Story = { args: { severity: 'success', message: 'Signal promoted to opportunity.' } };
export const Warning: Story = { args: { severity: 'warning', message: 'Certification expiring in 30 days.' } };
export const Error: Story = { args: { severity: 'error', message: 'Failed to load pipeline data.' } };
export const WithAction: Story = { args: { severity: 'info', message: 'Draft saved.', action: { label: 'Undo', onClick: () => {} } } };
