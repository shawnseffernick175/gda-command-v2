import type { Meta, StoryObj } from "@storybook/react";
import { PipelineAgingChart, type PipelineAgingData } from "./PipelineAgingChart";
import raw from "../../tests/fixtures/charts/pipeline-aging.json";

const data = raw as unknown as PipelineAgingData;

const meta: Meta<typeof PipelineAgingChart> = { title: "Charts/PipelineAgingChart", component: PipelineAgingChart };
export default meta;
type Story = StoryObj<typeof PipelineAgingChart>;

export const Default: Story = { args: { data } };
