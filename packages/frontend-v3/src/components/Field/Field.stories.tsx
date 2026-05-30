import type { Meta, StoryObj } from '@storybook/react';
import { Field } from './Field';

const meta: Meta<typeof Field> = { component: Field, title: 'Primitives/Field' };
export default meta;
type Story = StoryObj<typeof Field>;

export const Default: Story = { args: { label: 'Agency', value: 'Department of Defense', sourceUrl: 'https://sam.gov/entity/123' } };
export const NAICS: Story = { args: { label: 'NAICS', value: '541330', sourceUrl: 'https://fpds.gov/naics/541330' } };
