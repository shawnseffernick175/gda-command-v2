import type { Meta, StoryObj } from '@storybook/react';
import { Panel } from './Panel';

const meta: Meta<typeof Panel> = { component: Panel, title: 'Primitives/Panel' };
export default meta;
type Story = StoryObj<typeof Panel>;

export const Default: Story = { args: { title: 'Summary', children: 'Panel content goes here.' } };
export const NoTitle: Story = { args: { children: 'Untitled panel content.' } };
