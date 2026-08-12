import type { Meta, StoryObj } from "@storybook/react";
import { PriceHistoryChart } from "./PriceHistoryChart";

const sampleData = [
  { price: 599.99, recorded_at: "2025-10-01T12:00:00Z", dateLabel: "Oct 1" },
  { price: 549.99, recorded_at: "2025-11-01T12:00:00Z", dateLabel: "Nov 1" },
  { price: 499.99, recorded_at: "2025-12-01T12:00:00Z", dateLabel: "Dec 1" },
  { price: 449.99, recorded_at: "2026-01-01T12:00:00Z", dateLabel: "Jan 1" },
  { price: 429.99, recorded_at: "2026-02-01T12:00:00Z", dateLabel: "Feb 1" },
];

const meta = {
  title: "Components/PriceHistoryChart",
  component: PriceHistoryChart,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof PriceHistoryChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: sampleData,
  },
};

export const Compact: Story = {
  args: {
    data: sampleData,
    className: "h-48",
  },
};
