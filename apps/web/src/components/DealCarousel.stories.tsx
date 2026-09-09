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

const overflowDeals: Deal[] = [
  ...mockDeals,
  {
    id: 4,
    store_id: 1,
    store_name: "Worldwide Cyclery",
    store_sku: "SKU-4",
    product_name:
      "Santa Cruz Bronson CC MX with a title that wraps onto two lines",
    current_price: 5499,
    original_price: 7999,
    product_url: "https://example.com/4",
    image_url: "https://placehold.co/400x400/1a1a1a/fff?text=Bronson",
    brand: "Santa Cruz",
    is_in_stock: true,
    discount_pct: 31,
    last_scraped: "2024-01-15T12:00:00Z",
  },
  {
    id: 5,
    store_id: 2,
    store_name: "Jenson USA",
    store_sku: "SKU-5",
    product_name: "OneUp EDC Tool",
    current_price: 34,
    original_price: 42,
    product_url: "https://example.com/5",
    image_url: "https://placehold.co/400x400/1a1a1a/fff?text=Tool",
    brand: "OneUp",
    is_in_stock: true,
    discount_pct: 19,
    last_scraped: "2024-01-15T12:00:00Z",
  },
  {
    id: 6,
    store_id: 3,
    store_name: "REI",
    store_sku: "SKU-6",
    product_name: "Giro Manifest Spherical",
    current_price: 199,
    original_price: 280,
    product_url: "https://example.com/6",
    image_url: "https://placehold.co/400x400/1a1a1a/fff?text=Helmet",
    brand: "Giro",
    is_in_stock: true,
    discount_pct: 29,
    last_scraped: "2024-01-15T12:00:00Z",
  },
];

export const Overflow: Story = {
  args: {
    deals: overflowDeals,
    getHref: (deal) => `/deals/${deal.id}`,
    homeSection: "gear",
    ariaLabel: "Top gear deals",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Prev/next arrows sit below the rail when the row overflows, so in-view cards stay fully tappable. Cards stretch so CTAs stay aligned."
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
};

export const NarrowViewport: Story = {
  args: {
    deals: overflowDeals,
    getHref: (deal) => `/deals/${deal.id}`,
    homeSection: "gear",
    ariaLabel: "Top gear deals",
  },
  parameters: {
    layout: "padded",
    viewport: { defaultViewport: "mobile1" },
    docs: {
      description: {
        story:
          "One peeking card plus controls below the row. Arrows never cover the visible card.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
};

export const FitsWithoutScroll: Story = {
  args: {
    deals: mockDeals.slice(0, 1),
    getHref: (deal) => `/deals/${deal.id}`,
    homeSection: "mtb",
    ariaLabel: "Single mountain bike deal",
  },
  parameters: {
    docs: {
      description: {
        story: "Scroll controls stay hidden when every card already fits."
      },
    },
  },
};
