import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from './Textarea';

const meta: Meta<typeof Textarea> = { component: Textarea, title: 'Primitives/Textarea' };
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = { args: { label: 'Notes', placeholder: 'Enter notes…', value: '', onChange: () => {} } };
export const WithError: Story = { args: { label: 'Notes', value: 'x', error: 'Too short', onChange: () => {} } };
export const Disabled: Story = { args: { label: 'Notes', value: 'Read only', disabled: true, onChange: () => {} } };
