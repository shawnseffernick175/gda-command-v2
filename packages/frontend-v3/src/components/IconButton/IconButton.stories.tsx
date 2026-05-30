import type { Meta, StoryObj } from "@storybook/react";
import { IconButton } from "./IconButton";

const meta: Meta<typeof IconButton> = { title: "Components/IconButton", component: IconButton };
export default meta;
type Story = StoryObj<typeof IconButton>;

export const Ghost: Story = { args: { "aria-label": "Settings", children: "⚙" } };
export const Secondary: Story = { args: { variant: "secondary", "aria-label": "Edit", children: "✎" } };
export const Disabled: Story = { args: { "aria-label": "Disabled", children: "⚙", disabled: true } };
