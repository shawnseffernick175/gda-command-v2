import type { Meta, StoryObj } from "@storybook/react";
import { Panel } from "./Panel";

const meta: Meta<typeof Panel> = { title: "Components/Panel", component: Panel };
export default meta;
type Story = StoryObj<typeof Panel>;

export const Default: Story = { args: { children: "Panel content goes here." } };
