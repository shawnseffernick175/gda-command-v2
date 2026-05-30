import type { Meta, StoryObj } from '@storybook/react';
import { RadioGroup } from './RadioGroup';

const meta: Meta<typeof RadioGroup> = { component: RadioGroup, title: 'Primitives/RadioGroup' };
export default meta;
type Story = StoryObj<typeof RadioGroup>;

const options = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export const Default: Story = { args: { value: 'high', options, name: 'priority', onChange: () => {} } };
