import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';

const meta: Meta<typeof Card> = { component: Card, title: 'Primitives/Card' };
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = { args: { children: 'Default card content' } };
export const Clickable: Story = { args: { clickable: true, children: 'Click me', onClick: () => {} } };
export const BannerInfo: Story = { args: { variant: 'banner', bannerSeverity: 'info', children: 'Info banner' } };
export const BannerCritical: Story = { args: { variant: 'banner', bannerSeverity: 'critical', children: 'Critical' } };
