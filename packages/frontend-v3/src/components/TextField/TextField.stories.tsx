import type { Meta, StoryObj } from '@storybook/react';
import { TextField } from './TextField';

const meta: Meta<typeof TextField> = { component: TextField, title: 'Primitives/TextField' };
export default meta;
type Story = StoryObj<typeof TextField>;

export const Default: Story = { args: { label: 'Name', placeholder: 'Enter name', value: '', onChange: () => {} } };
export const WithValue: Story = { args: { label: 'Name', value: 'GDA Corp', onChange: () => {} } };
export const WithError: Story = { args: { label: 'Email', value: 'invalid', error: 'Invalid email format', onChange: () => {} } };
export const Disabled: Story = { args: { label: 'Name', value: 'Read only', disabled: true, onChange: () => {} } };
export const WithHelper: Story = { args: { label: 'NAICS', value: '', helper: 'Enter 6-digit code', onChange: () => {} } };
