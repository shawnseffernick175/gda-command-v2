import type { Meta, StoryObj } from "@storybook/react";
import { FundingVelocityChart, type FundingVelocityData } from "./FundingVelocityChart";
import raw from "../../tests/fixtures/charts/funding-velocity.json";

const data = raw as unknown as FundingVelocityData;

const meta: Meta<typeof FundingVelocityChart> = { title: "Charts/FundingVelocityChart", component: FundingVelocityChart };
export default meta;
type Story = StoryObj<typeof FundingVelocityChart>;

export const Default: Story = { args: { data } };
