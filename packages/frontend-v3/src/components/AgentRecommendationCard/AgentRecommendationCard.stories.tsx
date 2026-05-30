import type { Meta, StoryObj } from "@storybook/react";
import { AgentRecommendationCard } from "./AgentRecommendationCard";

const meta: Meta<typeof AgentRecommendationCard> = { title: "Components/AgentRecommendationCard", component: AgentRecommendationCard };
export default meta;
type Story = StoryObj<typeof AgentRecommendationCard>;

export const Pending: Story = {
  args: {
    recommendation: "Pursue OASIS SB Pool 1 - Cyber task order. Strong technical alignment with existing past performance on NGEN-R.",
    confidence: "high",
    sources: [
      { url: "https://sam.gov/opp/abc123", kind: "sam_gov", label: "SAM.gov" },
      { url: "https://govtribe.com/opp/xyz", kind: "govwin", label: "GovTribe" },
    ],
    reasoning: "Based on 3 past performance wins in similar cyber NAICS codes and existing relationship with contracting officer.",
    status: "pending",
  },
};

export const Approved: Story = {
  args: {
    ...Pending.args,
    status: "approved",
  },
};

export const LowConfidence: Story = {
  args: {
    recommendation: "Consider teaming with PD Systems for this requirement.",
    confidence: "low",
    sources: [{ url: "https://sam.gov/opp/def", kind: "sam_gov" }],
    status: "pending",
  },
};
