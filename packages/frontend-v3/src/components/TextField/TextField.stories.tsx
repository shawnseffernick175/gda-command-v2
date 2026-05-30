import type { Meta, StoryObj } from "@storybook/react";
import { TextField } from "./TextField";

const meta: Meta<typeof TextField> = {
  title: "Components/TextField",
  component: TextField,
};

export default meta;
type Story = StoryObj<typeof TextField>;

export const Default: Story = { args: { label: "Label", placeholder: "Enter value..." } };
export const WithError: Story = { args: { label: "Email", error: "Invalid email address", value: "bad" } };
export const WithHelper: Story = { args: { label: "Name", helper: "Enter your full name" } };
export const Disabled: Story = { args: { label: "Disabled", disabled: true, value: "Read only" } };
