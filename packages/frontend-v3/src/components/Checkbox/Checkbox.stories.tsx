import type { Meta, StoryObj } from '@storybook/react';
import { Checkbox } from './Checkbox';

const meta: Meta<typeof Checkbox> = { component: Checkbox, title: 'Primitives/Checkbox' };
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Unchecked: Story = { args: { checked: false, label: 'Include subcontracting', onChange: () => {} } };
export const Checked: Story = { args: { checked: true, label: 'Include subcontracting', onChange: () => {} } };
export const Indeterminate: Story = { args: { checked: false, indeterminate: true, label: 'Select all', onChange: () => {} } };
export const Disabled: Story = { args: { checked: true, label: 'Locked', disabled: true, onChange: () => {} } };
