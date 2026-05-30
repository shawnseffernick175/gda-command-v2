import type { Meta, StoryObj } from "@storybook/react";
import { RadioGroup } from "./RadioGroup";

const meta: Meta<typeof RadioGroup> = { title: "Components/RadioGroup", component: RadioGroup };
export default meta;
type Story = StoryObj<typeof RadioGroup>;

export const Default: Story = {
  args: {
    name: "priority",
    value: "medium",
    options: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
  },
};
