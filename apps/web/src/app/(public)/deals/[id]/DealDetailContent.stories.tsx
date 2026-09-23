import type { Meta, StoryObj } from "@storybook/react";
import type { Deal, DealVariantRow } from "@/api";
import { DealDetailContent } from "./DealDetailContent";

function row(
  partial: Partial<DealVariantRow> & Pick<DealVariantRow, "id" | "store_sku">,
): DealVariantRow {
  return {
    current_price: 7319.4,
    is_in_stock: true,
    ...partial,
  };
}

const groupedDeal: Deal = {
  id: 10,
  store_id: 1,
  store_name: "Worldwide Cyclery",
  store_sku: "SKU-M",
  product_name: "Santa Cruz Bronson CC",
  current_price: 7319.4,
  original_price: 9359.95,
  product_url: "https://example.com/bronson",
  image_url: "https://placehold.co/400x400/1a1a1a/fff?text=Bronson",
  brand: "Santa Cruz",
  is_in_stock: true,
  discount_pct: 22,
  last_scraped: "2026-09-01T12:00:00Z",
  variant_count: 5,
  price_range: [7319.4, 7999],
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
};

const meta = {
  title: "Pages/DealDetail",
  component: DealDetailContent,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Deal PDP. Grouped variants render as a table with an In stock badge per row — no size/color chips above the CTA.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DealDetailContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InStockVariantTable: Story = {
  args: {
    deal: groupedDeal,
    categoryTree: [],
  },
};

/** Scrape order S, XL, M, L — the table still renders S / M / L / XL (ZAC-287). */
export const ShopperSizeOrder: Story = {
  args: {
    deal: {
      ...groupedDeal,
      id: 1888755,
      product_name: "Niner RIP 9 RDO GX AXS",
      brand: "Niner",
      variants: [
        row({ id: 11, store_sku: "s", variant_options: { Size: "S", Color: "Silver" } }),
        row({ id: 12, store_sku: "xl", variant_options: { Size: "XL", Color: "Silver" } }),
        row({ id: 13, store_sku: "m", variant_options: { Size: "M", Color: "Silver" } }),
        row({ id: 14, store_sku: "l", variant_options: { Size: "L", Color: "Silver" } }),
      ],
    },
    categoryTree: [],
  },
};

/** Jenson color-only options: table still lists Size inferred from the SKU (ZAC-276). */
export const JensonColorOnlySkuSizes: Story = {
  args: {
    deal: {
      id: 1888806,
      store_id: 1,
      store_name: "JensonUSA",
      store_sku: "BI005147 RED/BLACK XL",
      product_name: "Marin Alpine Trail E1 Bosch E-Bike",
      current_price: 3644.27,
      original_price: 5699,
      product_url: "https://example.com/alpine",
      image_url: "https://placehold.co/400x400/1a1a1a/fff?text=Alpine",
      brand: "Marin Bikes",
      is_in_stock: true,
      discount_pct: 36,
      last_scraped: "2026-09-01T12:00:00Z",
      variant_count: 2,
      variant_options: { Color: "Red/Black" },
      variants: [
        row({
          id: 1888805,
          store_sku: "BI005147 RED/BLACK M",
          variant_options: { Color: "Red/Black" },
          current_price: 3644.27,
          original_price: 5699,
        }),
        row({
          id: 1888806,
          store_sku: "BI005147 RED/BLACK XL",
          variant_options: { Color: "Red/Black" },
          current_price: 3644.27,
          original_price: 5699,
        }),
      ],
    },
    categoryTree: [],
  },
};

/** One in-stock size (sold-out siblings hidden) — still show the table. */
export const SingleInStockVariant: Story = {
  args: {
    deal: {
      id: 1966452,
      store_id: 23,
      store_name: "Cambria Bikes",
      store_sku: "GM022025-62",
      product_name: "Smith Payroll MIPS MTB Helmet - Matt Forest",
      current_price: 149.99,
      original_price: 230,
      product_url: "https://example.com/payroll",
      image_url: "https://placehold.co/400x400/1a1a1a/fff?text=Payroll",
      brand: "Smith",
      is_in_stock: true,
      discount_pct: 35,
      last_scraped: "2026-09-01T12:00:00Z",
      variant_count: 3,
      variant_options: { Size: "Small", Color: "Matt Forest" },
      price_range: [115, 149.99],
      variants: [
        row({
          id: 1966453,
          store_sku: "GM022025-63",
          variant_options: { Size: "Medium", Color: "Matt Forest" },
          current_price: 115,
          original_price: 230,
          is_in_stock: false,
        }),
        row({
          id: 1966452,
          store_sku: "GM022025-62",
          variant_options: { Size: "Small", Color: "Matt Forest" },
          current_price: 149.99,
          original_price: 230,
        }),
        row({
          id: 1966454,
          store_sku: "GM022025-64",
          variant_options: { Size: "Large", Color: "Matt Forest" },
          current_price: 149.99,
          original_price: 230,
          is_in_stock: false,
        }),
      ],
    },
    categoryTree: [],
  },
};
