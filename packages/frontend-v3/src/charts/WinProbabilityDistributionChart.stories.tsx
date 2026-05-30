import type { Meta, StoryObj } from "@storybook/react";
import { WinProbabilityDistributionChart, type WinProbDistributionData } from "./WinProbabilityDistributionChart";
import raw from "../../tests/fixtures/charts/win-probability-distribution.json";

const data = raw as unknown as WinProbDistributionData;

const meta: Meta<typeof WinProbabilityDistributionChart> = { title: "Charts/WinProbabilityDistributionChart", component: WinProbabilityDistributionChart };
export default meta;
type Story = StoryObj<typeof WinProbabilityDistributionChart>;

export const Default: Story = { args: { data } };
