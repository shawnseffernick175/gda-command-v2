import type { Meta, StoryObj } from "@storybook/react";
import { Textarea } from "./Textarea";

const meta: Meta<typeof Textarea> = { title: "Components/Textarea", component: Textarea };
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = { args: { label: "Notes", placeholder: "Enter notes..." } };
export const WithError: Story = { args: { label: "Notes", error: "Required field" } };
