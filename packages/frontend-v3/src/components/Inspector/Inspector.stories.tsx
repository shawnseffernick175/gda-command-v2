import type { Meta, StoryObj } from "@storybook/react";
import { Inspector } from "./Inspector";

const meta: Meta<typeof Inspector> = { title: "Components/Inspector", component: Inspector };
export default meta;
type Story = StoryObj<typeof Inspector>;

export const Open: Story = {
  args: {
    open: true,
    title: "Opportunity Details",
    children: "Inspector panel content with opportunity metadata, sources, and actions.",
  },
};
