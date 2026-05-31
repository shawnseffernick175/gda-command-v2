import type { Meta, StoryObj } from '@storybook/react';
import { InputForm } from './InputForm';

const meta: Meta<typeof InputForm> = {
  title: 'Surfaces/FastTrack/InputForm',
  component: InputForm,
  decorators: [
    (Story) => (
      <div className="bg-canvas p-6 max-w-md">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof InputForm>;

export const Default: Story = {
  args: {
    onSubmit: () => {},
    disabled: false,
    isSubmitting: false,
  },
};

export const Submitting: Story = {
  args: {
    onSubmit: () => {},
    disabled: false,
    isSubmitting: true,
  },
};

export const Disabled: Story = {
  args: {
    onSubmit: () => {},
    disabled: true,
    isSubmitting: false,
  },
};
