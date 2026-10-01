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
      <KnobbyWheelSpinner className="size-14" label="Loading, default" />
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

export const StaysInView: Story = {
  name: "Stays in view while scrolling",
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="relative">
        <div
          className="pointer-events-none sticky top-[calc(50vh-1.75rem)] z-10 -mb-14 flex h-14 justify-center"
          aria-hidden
        >
          <KnobbyWheelSpinner />
        </div>
        <div className="grid grid-cols-2 gap-4 opacity-50 sm:grid-cols-3">
          {Array.from({ length: 18 }, (_, index) => (
            <div
              key={index}
              className="aspect-[4/5] rounded-sm border border-foreground bg-card"
            />
          ))}
        </div>
      </div>
    </div>
  ),
};
