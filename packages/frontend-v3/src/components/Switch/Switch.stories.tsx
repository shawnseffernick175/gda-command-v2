import type { Meta, StoryObj } from '@storybook/react';
import { Switch } from './Switch';

const meta: Meta<typeof Switch> = { component: Switch, title: 'Primitives/Switch' };
export default meta;
type Story = StoryObj<typeof Switch>;

export const Off: Story = { args: { checked: false, label: 'Dark mode', onChange: () => {} } };
export const On: Story = { args: { checked: true, label: 'Dark mode', onChange: () => {} } };
export const Disabled: Story = { args: { checked: false, label: 'Locked', disabled: true, onChange: () => {} } };
