import type { Meta, StoryObj } from "@storybook/react";
import { Slider } from "./Slider";

const meta: Meta<typeof Slider> = { title: "Components/Slider", component: Slider };
export default meta;
type Story = StoryObj<typeof Slider>;

export const Default: Story = { args: { value: 50, min: 0, max: 100, label: "Win Probability" } };
export const Disabled: Story = { args: { value: 30, disabled: true, label: "Locked" } };
