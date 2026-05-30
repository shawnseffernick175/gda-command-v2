import type { Meta, StoryObj } from '@storybook/react';
import { StageIndicator } from './StageIndicator';

const meta: Meta<typeof StageIndicator> = { component: StageIndicator, title: 'Primitives/StageIndicator' };
export default meta;
type Story = StoryObj<typeof StageIndicator>;

export const Stage0: Story = { args: { stage: 0 } };
export const Stage2: Story = { args: { stage: 2 } };
export const Stage4: Story = { args: { stage: 4 } };
export const Stage6: Story = { args: { stage: 6 } };
