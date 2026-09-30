import type { Meta, StoryObj } from "@storybook/react";
import type { Deal } from "../api";
import { DealCard } from "./DealCard";
import { ViewAllDealsCard } from "./ViewAllDealsCard";

const mockDeal: Deal = {
  id: 1,
  store_id: 1,
  store_name: "Worldwide Cyclery",
  store_sku: "SKU-1",
  product_name: "Santa Cruz Hightower CC",
  current_price: 3499,
  original_price: 4999,
  product_url: "https://example.com/1",
  image_url: "https://placehold.co/400x400/1a1a1a/fff?text=Bike",
  brand: "Santa Cruz",
  is_in_stock: true,
  discount_pct: 30,
  last_scraped: "2024-01-15T12:00:00Z",
};

const meta = {
  title: "Components/ViewAllDealsCard",
  component: ViewAllDealsCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="flex h-[32rem] w-[min(20rem,calc(100%-1.75rem))]">
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

export const BesideDealCard: Story = {
  args: {
    href: "/deals/c/bikes/mountain",
    label: "View all mountain bikes",
    homeSection: "mtb",
  },
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story:
          "Sits in the same rail slot as a DealCard, but as a dashed continue tile instead of a product card.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="flex h-[32rem] items-stretch gap-4">
        <div className="flex w-[min(20rem,calc(100%-1.75rem))] shrink-0">
          <DealCard
            deal={mockDeal}
            href="/deals/1"
            listSurface="home"
            homeSection="mtb"
          />
        </div>
        <div className="flex w-[min(20rem,calc(100%-1.75rem))] shrink-0">
          <Story />
        </div>
      </div>
    ),
  ],
};
