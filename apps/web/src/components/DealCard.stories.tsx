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
  args: {
    listSurface: "deals_list",
  },
  argTypes: {
    href: { control: "text" },
    listSurface: {
      control: "select",
      options: ["home", "deals_list", "category", "hub", "other"],
    },
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

export const MobileViewport: Story = {
  args: {
    deal: mockDeal,
    href: "/deals/1",
  },
  parameters: {
    layout: "padded",
    viewport: { defaultViewport: "mobile1" },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
};

const mockDealWithSizes: Deal = {
  ...mockDeal,
  id: 4,
  product_name: "Santa Cruz Bronson CC",
  current_price: 7319.4,
  original_price: 9359.95,
  discount_pct: 22,
  variant_count: 5,
  price_range: [7319.4, 7999],
  variants: [
    {
      id: 41,
      store_sku: "xs",
      variant_options: { Size: "XS", Color: "Green" },
      current_price: 7319.4,
      is_in_stock: false,
    },
    {
      id: 42,
      store_sku: "s",
      variant_options: { Size: "S", Color: "Green" },
      current_price: 7319.4,
      is_in_stock: true,
    },
    {
      id: 43,
      store_sku: "m",
      variant_options: { Size: "M", Color: "Green" },
      current_price: 7319.4,
      is_in_stock: true,
    },
    {
      id: 44,
      store_sku: "l",
      variant_options: { Size: "L", Color: "Green" },
      current_price: 7319.4,
      is_in_stock: true,
    },
    {
      id: 45,
      store_sku: "xl",
      variant_options: { Size: "XL", Color: "Green" },
      current_price: 7999,
      is_in_stock: true,
    },
  ],
};

export const InStockSizes: Story = {
  args: {
    deal: mockDealWithSizes,
    href: "/deals/4",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Grouped card with in-stock size chips. Sold-out XS is omitted; price range shows when sizes differ.",
      },
    },
  },
};

export const CtaAlignment: Story = {
  args: {
    deal: mockDeal,
    href: "/deals/1",
  },
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story:
          "CTAs pin to the card footer so Snag / View details line up across a row when titles wrap to different lengths.",
      },
    },
  },
  render: () => (
    <div className="grid max-w-5xl grid-cols-1 items-stretch gap-4 sm:grid-cols-3">
      <div className="flex h-full min-h-0 flex-col">
        <DealCard
          deal={{
            ...mockDeal,
            id: 11,
            product_name: "XT cassette",
          }}
          href="/deals/11"
          listSurface="deals_list"
        />
      </div>
      <div className="flex h-full min-h-0 flex-col">
        <DealCard
          deal={{
            ...mockDeal,
            id: 12,
            product_name:
              "Shimano XT M8100 12-Speed Groupset with extra long product title",
          }}
          href="/deals/12"
          listSurface="deals_list"
        />
      </div>
      <div className="flex h-full min-h-0 flex-col">
        <DealCard
          deal={mockDealWithSizes}
          href="/deals/4"
          listSurface="deals_list"
        />
      </div>
    </div>
  ),
};

export const ExtractedBikeSize: Story = {
  args: {
    deal: {
      ...mockDeal,
      id: 5,
      product_name: "Juliana Roubion CC Medium",
      brand: "Juliana",
      category_path: ["Bikes", "Mountain"],
      metadata: { llm_specs: { bike_size: "M" } },
    },
    href: "/deals/5",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Single-SKU bike without variant options still shows Size from LLM/spec extraction.",
      },
    },
  },
};
