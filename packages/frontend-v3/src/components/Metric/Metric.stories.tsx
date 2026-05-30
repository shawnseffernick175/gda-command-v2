import type { Meta, StoryObj } from "@storybook/react";
import { Metric } from "./Metric";

const meta: Meta<typeof Metric> = { title: "Components/Metric", component: Metric };
export default meta;
type Story = StoryObj<typeof Metric>;

export const Up: Story = { args: { label: "Pipeline Value", value: "$48.2M", sourceUrl: "https://sam.gov/entity/x", trend: "up" } };
export const Down: Story = { args: { label: "Win Rate", value: "23%", sourceUrl: "https://sam.gov/entity/x", trend: "down" } };
export const Flat: Story = { args: { label: "Active Captures", value: "8", sourceUrl: "https://sam.gov/entity/x", trend: "flat" } };
