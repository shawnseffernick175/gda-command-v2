import type { Meta, StoryObj } from '@storybook/react';
import { Link } from './Link';

const meta: Meta<typeof Link> = { component: Link, title: 'Primitives/Link' };
export default meta;
type Story = StoryObj<typeof Link>;

export const Internal: Story = { args: { href: '/opp/123', children: 'View opportunity' } };
export const External: Story = { args: { href: 'https://sam.gov', external: true, children: 'SAM.gov' } };
