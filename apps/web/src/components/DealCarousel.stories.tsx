import type { Meta, StoryObj } from "@storybook/react";
import type { Deal } from "../api";
import { DealCarousel } from "./DealCarousel";

const mockDeals: Deal[] = [
  {
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
  },
  {
    id: 2,
    store_id: 2,
    store_name: "Jenson USA",
    store_sku: "SKU-2",
    product_name: "Fox 36 Factory Fork",
    current_price: 799,
    original_price: 1099,
    product_url: "https://example.com/2",
    image_url: "https://placehold.co/400x400/1a1a1a/fff?text=Fork",
    brand: "Fox",
    is_in_stock: true,
    discount_pct: 27,
    last_scraped: "2024-01-15T12:00:00Z",
  },
  {
    id: 3,
    store_id: 3,
    store_name: "REI",
    store_sku: "SKU-3",
    product_name: "SRAM GX Eagle Groupset",
    current_price: 449,
    original_price: 599,
    product_url: "https://example.com/3",
    image_url: "https://placehold.co/400x400/1a1a1a/fff?text=Drivetrain",
    brand: "SRAM",
    is_in_stock: true,
    discount_pct: 25,
    last_scraped: "2024-01-15T12:00:00Z",
  },
];

const meta = {
  title: "Components/DealCarousel",
  component: DealCarousel,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DealCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    deals: mockDeals,
    getHref: (deal) => `/deals/${deal.id}`,
    homeSection: "mtb",
    ariaLabel: "Top mountain bike deals",
  },
};
