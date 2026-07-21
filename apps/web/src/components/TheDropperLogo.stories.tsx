import type { Meta, StoryObj } from "@storybook/react";
import { TheDropperLogo } from "./TheDropperLogo";

const meta = {
  title: "Components/TheDropperLogo",
  component: TheDropperLogo,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    className: { control: "text" },
  },
} satisfies Meta<typeof TheDropperLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NavbarSize: Story = {
  name: "Navbar size (nav variant)",
  args: {
    variant: "nav",
    className: "h-12 sm:h-14",
  },
};

export const Large: Story = {
  args: {
    className: "h-40",
  },
};

export const InheritsColor: Story = {
  name: "Inherits currentColor",
  render: (args) => (
    <div className="flex items-center gap-8">
      <span className="text-foreground">
        <TheDropperLogo {...args} className="h-16" />
      </span>
      <span className="text-primary">
        <TheDropperLogo {...args} className="h-16" />
      </span>
      <span className="rounded-md bg-stone-900 p-4 text-stone-50">
        <TheDropperLogo {...args} className="h-16" />
      </span>
    </div>
  ),
};
