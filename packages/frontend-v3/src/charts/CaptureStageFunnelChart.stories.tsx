import type { Meta, StoryObj } from "@storybook/react";
import { CaptureStageFunnelChart, type CaptureStageData } from "./CaptureStageFunnelChart";
import raw from "../../tests/fixtures/charts/capture-stage-funnel.json";

const data = raw as unknown as CaptureStageData;

const meta: Meta<typeof CaptureStageFunnelChart> = { title: "Charts/CaptureStageFunnelChart", component: CaptureStageFunnelChart };
export default meta;
type Story = StoryObj<typeof CaptureStageFunnelChart>;

export const Default: Story = { args: { data } };
