import type { Meta, StoryObj } from "@storybook/react";
import { ViewAllDealsCard } from "./ViewAllDealsCard";

const meta = {
  title: "Components/ViewAllDealsCard",
  component: ViewAllDealsCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="flex h-[28rem] w-[min(20rem,calc(100%-1.75rem))]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ViewAllDealsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MountainBikes: Story = {
  args: {
    href: "/deals/c/bikes/mountain",
    label: "View all mountain bikes",
    homeSection: "mtb",
  },
};

export const PriceDrops: Story = {
  args: {
    href: "/deals?sort=price_drop",
    label: "View all price drops",
    homeSection: "price_drops",
  },
};

export const Components: Story = {
  args: {
    href: "/deals/c/components",
    label: "View all components",
    homeSection: "components",
  },
};
