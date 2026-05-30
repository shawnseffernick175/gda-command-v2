import type { Meta, StoryObj } from "@storybook/react";
import { Select } from "./Select";

const meta: Meta<typeof Select> = { title: "Components/Select", component: Select };
export default meta;
type Story = StoryObj<typeof Select>;

const options = [
  { value: "541330", label: "Engineering Services" },
  { value: "541512", label: "Computer Systems Design" },
  { value: "541613", label: "Marketing Consulting" },
];

export const Default: Story = { args: { label: "NAICS Code", options, value: null, placeholder: "Select NAICS..." } };
export const WithValue: Story = { args: { label: "NAICS Code", options, value: "541330" } };
export const Disabled: Story = { args: { label: "NAICS Code", options, value: "541330", disabled: true } };
