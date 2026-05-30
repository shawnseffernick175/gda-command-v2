import type { Meta, StoryObj } from "@storybook/react";
import { SourceUrlChip } from "./SourceUrlChip";

const meta: Meta<typeof SourceUrlChip> = {
  title: "Components/SourceUrlChip",
  component: SourceUrlChip,
};

export default meta;
type Story = StoryObj<typeof SourceUrlChip>;

export const SamGov: Story = { args: { url: "https://sam.gov/opp/abc123", source_kind: "sam_gov", retrieved_at: new Date().toISOString() } };
export const GovWin: Story = { args: { url: "https://govwin.com/opportunity/5678", source_kind: "govwin", retrieved_at: new Date(Date.now() - 7200000).toISOString() } };
export const WithLabel: Story = { args: { url: "https://usaspending.gov/award/123", source_kind: "usaspending", retrieved_at: new Date().toISOString(), label: "USASpending Award" } };
