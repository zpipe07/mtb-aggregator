import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { PriceRangeFilter } from "./PriceRangeFilter";

const meta = {
  title: "Components/PriceRangeFilter",
  component: PriceRangeFilter,
  parameters: { layout: "padded" },
  args: {
    minPrice: "",
    maxPrice: "",
    priceRange: { min: 12, max: 4299 },
    onMinPriceChange: () => undefined,
    onMaxPriceChange: () => undefined,
  },
} satisfies Meta<typeof PriceRangeFilter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Filled: Story = {
  args: {
    minPrice: "50",
    maxPrice: "500",
  },
};

export const Interactive: Story = {
  render: function InteractivePriceRange(args) {
    const [minPrice, setMinPrice] = useState(args.minPrice);
    const [maxPrice, setMaxPrice] = useState(args.maxPrice);
    return (
      <div className="w-60">
        <PriceRangeFilter
          {...args}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onMinPriceChange={setMinPrice}
          onMaxPriceChange={setMaxPrice}
        />
      </div>
    );
  },
};
