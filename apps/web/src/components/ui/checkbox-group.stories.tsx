import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { CheckboxGroup } from "./checkbox-group";

const meta = {
  title: "Components/UI/CheckboxGroup",
  component: CheckboxGroup,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof CheckboxGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

const fewOptions = [
  { value: '2.3"', count: 12 },
  { value: '2.4"', count: 8 },
  { value: '2.5"', count: 3 },
];

export const Default: Story = {
  args: {
    name: "story-tire-width",
    legend: "Tire width",
    selected: ['2.3"'],
    options: fewOptions,
    onToggle: () => {},
  },
  render: function Render(args) {
    const [selected, setSelected] = useState<string[]>(args.selected);
    return (
      <div className="max-w-xs">
        <CheckboxGroup
          {...args}
          selected={selected}
          onToggle={(v) => {
            setSelected((prev) =>
              prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
            );
          }}
        />
      </div>
    );
  },
};

const manyOptions = Array.from({ length: 30 }, (_, i) => ({
  value: `Size ${i + 1}`,
  count: 30 - i,
}));

export const ManyOptions: Story = {
  args: {
    name: "story-sizes",
    legend: "Size (scroll)",
    selected: ["Size 1", "Size 5"],
    options: manyOptions,
    onToggle: () => {},
  },
  render: function Render(args) {
    const [selected, setSelected] = useState<string[]>(args.selected);
    return (
      <div className="max-w-xs">
        <CheckboxGroup
          {...args}
          selected={selected}
          onToggle={(v) => {
            setSelected((prev) =>
              prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
            );
          }}
        />
      </div>
    );
  },
};

const staleOptions = [
  { value: "29", count: 10 },
  { value: "27.5", count: 4 },
];

export const StaleSelectionNotInList: Story = {
  args: {
    name: "story-stale",
    legend: "Wheel size",
    selected: ["OldValue"],
    options: [
      { value: "OldValue", count: 0 },
      ...staleOptions,
    ],
    onToggle: () => {},
  },
  render: function Render(args) {
    const [selected, setSelected] = useState<string[]>(args.selected);
    return (
      <div className="max-w-xs">
        <CheckboxGroup
          {...args}
          selected={selected}
          options={args.options}
          onToggle={(v) => {
            setSelected((prev) =>
              prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
            );
          }}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Stale bookmark value merged into options (count 0), as in FilterSidebar.
        </p>
      </div>
    );
  },
};

export const WithoutCounts: Story = {
  args: {
    name: "story-plain",
    legend: "Features",
    selected: [],
    options: [{ value: "Tubeless ready" }, { value: "Boost" }],
    onToggle: () => {},
  },
  render: function Render(args) {
    const [selected, setSelected] = useState<string[]>(args.selected ?? []);
    return (
      <div className="max-w-xs">
        <CheckboxGroup
          {...args}
          selected={selected}
          onToggle={(v) => {
            setSelected((prev) =>
              prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
            );
          }}
        />
      </div>
    );
  },
};
