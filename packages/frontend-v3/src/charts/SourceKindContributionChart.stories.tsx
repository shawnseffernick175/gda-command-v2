import type { Meta, StoryObj } from "@storybook/react";
import { SourceKindContributionChart, type SourceKindContributionData } from "./SourceKindContributionChart";
import raw from "../../tests/fixtures/charts/source-kind-contribution.json";

const data = raw as unknown as SourceKindContributionData;

const meta: Meta<typeof SourceKindContributionChart> = { title: "Charts/SourceKindContributionChart", component: SourceKindContributionChart };
export default meta;
type Story = StoryObj<typeof SourceKindContributionChart>;

export const Default: Story = { args: { data } };
