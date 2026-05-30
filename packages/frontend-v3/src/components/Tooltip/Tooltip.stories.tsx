import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip } from "./Tooltip";

const meta: Meta<typeof Tooltip> = { title: "Components/Tooltip", component: Tooltip };
export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  args: {
    content: "This is a tooltip",
    children: <button className="px-3 py-1 border border-border rounded-sm text-sm text-ink-primary">Hover me</button>,
  },
};
