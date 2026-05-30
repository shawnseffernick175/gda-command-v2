import type { Meta, StoryObj } from "@storybook/react";
import { Switch } from "./Switch";

const meta: Meta<typeof Switch> = { title: "Components/Switch", component: Switch };
export default meta;
type Story = StoryObj<typeof Switch>;

export const Off: Story = { args: { checked: false, label: "Dark mode" } };
export const On: Story = { args: { checked: true, label: "Dark mode" } };
export const Disabled: Story = { args: { checked: false, label: "Disabled", disabled: true } };
