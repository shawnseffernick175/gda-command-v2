import type { Meta, StoryObj } from '@storybook/react';
import { Slider } from './Slider';

const meta: Meta<typeof Slider> = { component: Slider, title: 'Primitives/Slider' };
export default meta;
type Story = StoryObj<typeof Slider>;

export const Default: Story = { args: { min: 0, max: 100, value: 50, label: 'Win probability', onChange: () => {} } };
export const Disabled: Story = { args: { min: 0, max: 100, value: 30, label: 'Locked', disabled: true, onChange: () => {} } };
