import type { Meta, StoryObj } from "@storybook/react";
import type { Deal } from "@/api";
import { BlogDealRail } from "./BlogDealRail";

const mockDeal: Deal = {
  id: 1,
  store_id: 1,
  store_name: "Worldwide Cyclery",
  store_sku: "SKU-123",
  product_name: "Fox Speedframe Pro Helmet",
  current_price: 149.99,
  original_price: 219.99,
  product_url: "https://example.com/product",
  affiliate_url: "https://example.com/affiliate/product",
  image_url: "https://placehold.co/400x400/1a1a1a/fff?text=Helmet",
  brand: "Fox",
  category_path: ["Gear", "Helmets"],
  is_in_stock: true,
  discount_pct: 32,
  last_scraped: "2026-09-04T12:00:00Z",
};

const meta = {
  title: "Components/BlogDealRail",
  component: BlogDealRail,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof BlogDealRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDeals: Story = {
  args: {
    title: "Helmets on sale",
    deals: [mockDeal, { ...mockDeal, id: 2, product_name: "Giro Manifest" }],
    seeAllHref: "/deals/c/gear/helmets",
    seeAllLabel: "All helmet deals →",
  },
};

export const Empty: Story = {
  args: {
    title: "Helmets on sale",
    deals: [],
    seeAllHref: "/deals/c/gear/helmets",
    seeAllLabel: "All helmet deals →",
  },
};
