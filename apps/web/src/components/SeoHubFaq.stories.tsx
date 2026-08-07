import type { Meta, StoryObj } from "@storybook/react";
import { SeoHubFaq } from "./SeoHubFaq";

const sampleFaq = [
  {
    question: "What mountain bikes show up in this list?",
    answer:
      "Complete mountain bikes listed at $3,000 or less from shops we monitor—not a single-store catalog.",
  },
  {
    question: "How often is this list updated?",
    answer:
      "We re-scrape retailer sale pages every few hours. Sold-out or above-budget bikes may drop off on the next refresh.",
  },
];

const meta = {
  title: "Components/SeoHubFaq",
  component: SeoHubFaq,
  parameters: { layout: "padded" },
  args: {
    items: sampleFaq,
  },
} satisfies Meta<typeof SeoHubFaq>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleItem: Story = {
  args: {
    items: [sampleFaq[0]],
  },
};
