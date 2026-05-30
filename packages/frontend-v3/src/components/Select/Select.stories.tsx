import type { Meta, StoryObj } from '@storybook/react';
import { Select } from './Select';

const meta: Meta<typeof Select> = { component: Select, title: 'Primitives/Select' };
export default meta;
type Story = StoryObj<typeof Select>;

const options = [
  { value: 'sam', label: 'SAM.gov' },
  { value: 'fpds', label: 'FPDS' },
  { value: 'usaspending', label: 'USAspending' },
];

export const Default: Story = { args: { label: 'Source', options, value: null, onChange: () => {} } };
export const Selected: Story = { args: { label: 'Source', options, value: 'sam', onChange: () => {} } };
export const Disabled: Story = { args: { label: 'Source', options, value: 'sam', disabled: true, onChange: () => {} } };
