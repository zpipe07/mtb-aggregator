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

export const StaysOverGrid: Story = {
  name: "Stays over the deal grid",
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="mx-auto max-w-3xl px-6">
      <div className="flex h-[70vh] items-end pb-6 font-mono text-xs text-muted-foreground">
        Toolbar and filters
      </div>
      <div className="relative" data-deal-grid>
        <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
          <div className="sticky top-[calc(50vh-1.75rem)] flex justify-center">
            <KnobbyWheelSpinner />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 opacity-50 sm:grid-cols-3">
          {Array.from({ length: 12 }, (_, index) => (
            <div
              key={index}
              className="aspect-[4/5] rounded-sm border border-foreground bg-card"
            />
          ))}
        </div>
      </div>
      <div className="flex h-[80vh] items-start pt-6 font-mono text-xs text-muted-foreground">
        Below the grid
      </div>
    </div>
  ),
};
