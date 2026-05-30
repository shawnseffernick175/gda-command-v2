import type { Meta, StoryObj } from "@storybook/react";
import { Stat } from "./Stat";

const meta: Meta<typeof Stat> = {
  title: "Components/Stat",
  component: Stat,
};

export default meta;
type Story = StoryObj<typeof Stat>;

export const Default: Story = { args: { label: "Annual Revenue", value: "$31.7M", sourceUrl: "https://sam.gov/entity/abc" } };
export const Count: Story = { args: { label: "Active Pursuits", value: "12", sourceUrl: "https://govtribe.com/vendor/123" } };
