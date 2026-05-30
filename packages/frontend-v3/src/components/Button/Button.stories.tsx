import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  argTypes: {
    variant: { control: "select", options: ["primary", "secondary", "ghost", "danger"] },
    size: { control: "select", options: ["sm", "md"] },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: "primary", children: "Primary Button" } };
export const Secondary: Story = { args: { variant: "secondary", children: "Secondary Button" } };
export const Ghost: Story = { args: { variant: "ghost", children: "Ghost Button" } };
export const Danger: Story = { args: { variant: "danger", children: "Delete" } };
export const Disabled: Story = { args: { variant: "primary", children: "Disabled", disabled: true } };
export const Loading: Story = { args: { variant: "primary", children: "Saving...", loading: true } };
export const Small: Story = { args: { variant: "primary", children: "Small", size: "sm" } };
