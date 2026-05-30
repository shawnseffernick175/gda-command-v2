import type { Meta, StoryObj } from "@storybook/react";
import { Card } from "./Card";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = { args: { children: "Card content goes here." } };
export const BannerInfo: Story = { args: { variant: "banner", bannerSeverity: "info", children: "Informational banner card." } };
export const BannerCritical: Story = { args: { variant: "banner", bannerSeverity: "critical", children: "Critical alert!" } };
export const Clickable: Story = { args: { clickable: true, children: "Click me" } };
