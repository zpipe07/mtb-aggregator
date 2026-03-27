import type { Meta, StoryObj } from "@storybook/react";
import { DealCard } from "./DealCard";
import type { Deal } from "../api";

const mockDeal: Deal = {
  id: 1,
  store_id: 1,
  store_name: "Worldwide Cyclery",
  store_sku: "SKU-123",
  product_name: "Shimano XT M8100 12-Speed Groupset",
  current_price: 449.99,
  original_price: 599.99,
  product_url: "https://example.com/product",
  affiliate_url: "https://example.com/affiliate/product",
  image_url: "https://placehold.co/400x400/1a1a1a/fff?text=Groupset",
  brand: "Shimano",
  category_path: ["Components", "Drivetrain"],
  is_in_stock: true,
  discount_pct: 25,
  last_scraped: "2024-01-15T12:00:00Z",
};

const mockDealNoImage: Deal = {
  ...mockDeal,
  id: 2,
  image_url: undefined,
  product_name: "Generic MTB Frame",
};

const mockDealNoDiscount: Deal = {
  ...mockDeal,
  id: 3,
  original_price: undefined,
  discount_pct: undefined,
  product_name: "New Arrival Bike",
};

const meta = {
  title: "Components/DealCard",
  component: DealCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    href: { control: "text" },
  },
} satisfies Meta<typeof DealCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    deal: mockDeal,
    href: "/deals/1",
  },
};

export const NoImage: Story = {
  args: {
    deal: mockDealNoImage,
    href: "/deals/2",
  },
};

export const NoDiscount: Story = {
  args: {
    deal: mockDealNoDiscount,
    href: "/deals/3",
  },
};

export const ReadOnly: Story = {
  args: {
    deal: mockDeal,
    href: undefined,
  },
};
