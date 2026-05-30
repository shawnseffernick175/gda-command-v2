import type { Meta, StoryObj } from "@storybook/react";
import { Checkbox } from "./Checkbox";

const meta: Meta<typeof Checkbox> = { title: "Components/Checkbox", component: Checkbox };
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Unchecked: Story = { args: { checked: false, label: "Accept terms" } };
export const Checked: Story = { args: { checked: true, label: "Accept terms" } };
export const Disabled: Story = { args: { checked: false, label: "Disabled", disabled: true } };
