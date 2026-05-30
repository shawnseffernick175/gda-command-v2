import type { Meta, StoryObj } from "@storybook/react";
import { Link } from "./Link";

const meta: Meta<typeof Link> = { title: "Components/Link", component: Link };
export default meta;
type Story = StoryObj<typeof Link>;

export const Default: Story = { args: { href: "#", children: "Internal link" } };
export const External: Story = { args: { href: "https://sam.gov", children: "SAM.gov", external: true } };
