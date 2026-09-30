import type { Meta, StoryObj } from "@storybook/react";
import { PriceHistoryChart } from "./PriceHistoryChart";
import { PriceHistoryChartSkeleton } from "./skeletons";

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

/** Deal PDP placeholder while the recharts chunk loads; same frame box as Default. */
export const Loading: Story = {
  args: {
    data: sampleData,
  },
  render: () => <PriceHistoryChartSkeleton />,
};

export const Compact: Story = {
  args: {
    data: sampleData,
    className: "h-48",
  },
};

/** Daily points like `/deals/1888755`, where every date label used to collide. */
const denseDaily = Array.from({ length: 42 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 12 + i, 12));
  return {
    price: 4499.94 - (i > 37 ? 450 : 0),
    recorded_at: d.toISOString(),
    dateLabel: d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
  };
});

export const DensePhone: Story = {
  args: {
    data: denseDaily,
  },
  decorators: [
    (Story) => (
      <div className="w-[320px]">
        <Story />
      </div>
    ),
  ],
};

export const DenseDesktop: Story = {
  args: {
    data: denseDaily,
  },
  decorators: [
    (Story) => (
      <div className="w-[652px]">
        <Story />
      </div>
    ),
  ],
};
