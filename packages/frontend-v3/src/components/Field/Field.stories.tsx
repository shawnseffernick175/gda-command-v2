import type { Meta, StoryObj } from "@storybook/react";
import { Field } from "./Field";

const meta: Meta<typeof Field> = { title: "Components/Field", component: Field };
export default meta;
type Story = StoryObj<typeof Field>;

export const Default: Story = { args: { label: "NAICS Code", value: "541330 — Engineering Services", sourceUrl: "https://sam.gov/opp/abc" } };
export const Long: Story = { args: { label: "Title", value: "Next Generation Enterprise Network (NGEN) Service Management, Integration, and Transport", sourceUrl: "https://sam.gov/opp/def" } };
