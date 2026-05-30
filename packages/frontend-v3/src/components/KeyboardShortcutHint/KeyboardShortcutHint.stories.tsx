import type { Meta, StoryObj } from "@storybook/react";
import { KeyboardShortcutHint } from "./KeyboardShortcutHint";

const meta: Meta<typeof KeyboardShortcutHint> = { title: "Components/KeyboardShortcutHint", component: KeyboardShortcutHint };
export default meta;
type Story = StoryObj<typeof KeyboardShortcutHint>;

export const Single: Story = { args: { keys: ["⌘K"] } };
export const Combo: Story = { args: { keys: ["Ctrl", "Shift", "P"] } };
