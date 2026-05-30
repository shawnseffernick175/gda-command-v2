import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  component: Button,
  title: 'Primitives/Button',
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: 'primary', children: 'Primary' } };
export const Secondary: Story = { args: { variant: 'secondary', children: 'Secondary' } };
export const Ghost: Story = { args: { variant: 'ghost', children: 'Ghost' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Danger' } };
export const Disabled: Story = { args: { variant: 'primary', children: 'Disabled', disabled: true } };
export const Loading: Story = { args: { variant: 'primary', children: 'Loading', loading: true } };
export const Small: Story = { args: { variant: 'primary', children: 'Small', size: 'sm' } };
