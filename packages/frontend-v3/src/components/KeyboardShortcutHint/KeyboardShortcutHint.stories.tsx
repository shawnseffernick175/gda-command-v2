import type { Meta, StoryObj } from '@storybook/react';
import { KeyboardShortcutHint } from './KeyboardShortcutHint';

const meta: Meta<typeof KeyboardShortcutHint> = { component: KeyboardShortcutHint, title: 'Primitives/KeyboardShortcutHint' };
export default meta;
type Story = StoryObj<typeof KeyboardShortcutHint>;

export const Default: Story = { args: { keys: ['Ctrl', 'K'] } };
export const WithLabel: Story = { args: { keys: ['Ctrl', 'K'], label: 'Command palette' } };
export const Single: Story = { args: { keys: ['Esc'] } };
