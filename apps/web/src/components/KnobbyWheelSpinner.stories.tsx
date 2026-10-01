import type { Meta, StoryObj } from "@storybook/react";
import { KnobbyWheelSpinner } from "./KnobbyWheelSpinner";

const meta = {
  title: "Components/KnobbyWheelSpinner",
  component: KnobbyWheelSpinner,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    className: { control: "text" },
    label: { control: "text" },
  },
} satisfies Meta<typeof KnobbyWheelSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  name: "Sizes",
  render: () => (
    <div className="flex items-end gap-6 text-foreground">
      <KnobbyWheelSpinner className="size-4" label="Loading, tiny" />
      <KnobbyWheelSpinner className="size-8" label="Loading, small" />
      <KnobbyWheelSpinner className="size-12" label="Loading, default" />
      <KnobbyWheelSpinner className="size-24" label="Loading, large" />
    </div>
  ),
};

export const OnDark: Story = {
  name: "On dark",
  render: () => (
    <div className="rounded-md bg-stone-900 p-8">
      <KnobbyWheelSpinner className="text-stone-50" />
    </div>
  ),
};

export const DealsPending: Story = {
  name: "Deals results pending",
  render: () => (
    <div className="relative w-80">
      <div className="grid grid-cols-2 gap-3 opacity-50">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="aspect-[4/5] rounded-sm border border-foreground bg-card"
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-10">
        <KnobbyWheelSpinner />
      </div>
    </div>
  ),
};
