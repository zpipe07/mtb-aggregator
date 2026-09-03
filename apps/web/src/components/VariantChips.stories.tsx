import type { Meta, StoryObj } from "@storybook/react";
import type { Deal, DealVariantRow } from "../api";
import { VariantChips } from "./VariantChips";

const baseDeal: Deal = {
  id: 10,
  store_id: 1,
  store_name: "Worldwide Cyclery",
  store_sku: "SKU-M",
  product_name: "Santa Cruz Bronson CC",
  current_price: 7319.4,
  original_price: 9359.95,
  product_url: "https://example.com/bronson",
  brand: "Santa Cruz",
  is_in_stock: true,
  discount_pct: 22,
  last_scraped: "2026-09-01T12:00:00Z",
  variant_count: 5,
};

function row(
  partial: Partial<DealVariantRow> & Pick<DealVariantRow, "id" | "store_sku">,
): DealVariantRow {
  return {
    current_price: 7319.4,
    is_in_stock: true,
    ...partial,
  };
}

const sizedDeal: Deal = {
  ...baseDeal,
  variants: [
    row({
      id: 1,
      store_sku: "xs",
      variant_options: { Size: "XS", Color: "Green" },
      is_in_stock: false,
    }),
    row({ id: 2, store_sku: "s", variant_options: { Size: "S", Color: "Green" } }),
    row({ id: 3, store_sku: "m", variant_options: { Size: "M", Color: "Green" } }),
    row({ id: 4, store_sku: "l", variant_options: { Size: "L", Color: "Green" } }),
    row({
      id: 5,
      store_sku: "xl",
      variant_options: { Size: "XL", Color: "Green" },
      current_price: 7999,
    }),
  ],
  price_range: [7319.4, 7999],
};

const meta = {
  title: "Components/VariantChips",
  component: VariantChips,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "In-stock size/color chips for grouped deals. Sold-out options are omitted. Compact density is a single row for listing cards; detail density wraps and can show per-size prices.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof VariantChips>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompactSizes: Story = {
  args: {
    deal: sizedDeal,
    density: "compact",
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export const DetailWithPerSizePrices: Story = {
  args: {
    deal: sizedDeal,
    density: "detail",
  },
  decorators: [
    (Story) => (
      <div className="w-[28rem]">
        <Story />
      </div>
    ),
  ],
};

export const CompactOverflow: Story = {
  args: {
    density: "compact",
    deal: {
      ...baseDeal,
      variants: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"].map((size, i) =>
        row({
          id: i + 1,
          store_sku: size,
          variant_options: { Size: size },
        }),
      ),
    },
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export const ColorsOnly: Story = {
  args: {
    density: "detail",
    deal: {
      ...baseDeal,
      product_name: "Fox Racing Helmet",
      variants: [
        row({
          id: 1,
          store_sku: "blk",
          variant_options: { Color: "Black" },
        }),
        row({
          id: 2,
          store_sku: "wht",
          variant_options: { Color: "White" },
          is_in_stock: false,
        }),
        row({
          id: 3,
          store_sku: "org",
          variant_options: { Color: "Atomic Orange" },
        }),
      ],
    },
  },
};

export const NoOptions: Story = {
  args: {
    deal: baseDeal,
    density: "compact",
  },
};
