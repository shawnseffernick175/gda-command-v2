import type { Meta, StoryObj } from "@storybook/react";
import { Tabs } from "./Tabs";

const meta: Meta<typeof Tabs> = { title: "Components/Tabs", component: Tabs };
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  args: {
    items: [
      { value: "overview", label: "Overview", content: "Overview content" },
      { value: "details", label: "Details", content: "Details content" },
      { value: "history", label: "History", content: "History content" },
    ],
  },
};
