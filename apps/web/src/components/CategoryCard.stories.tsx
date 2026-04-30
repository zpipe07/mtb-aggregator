import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import { CategoryCard } from "./CategoryCard";

const meta = {
  title: "Components/CategoryCard",
  component: CategoryCard,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  argTypes: {
    label: { control: "text" },
    to: { control: "text" },
    description: { control: "text" },
    imageSrc: { control: "text" },
    dealCount: { control: "number" },
  },
} satisfies Meta<typeof CategoryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Mountain Bikes",
    to: "/deals/c/bikes-mountain",
    description: "128 deals",
  },
};

export const WithoutImageNoDeals: Story = {
  name: "Without image · no deals",
  args: {
    label: "Full Suspension",
    to: "/deals/c/bikes-mountain-full-suspension",
    description: "No deals right now",
  },
};

export const WithDescription: Story = {
  args: {
    label: "E-Bikes",
    to: "/deals?category=bikes-electric",
    description: "Electric mountain bikes and accessories",
  },
};

export const WithDealCountOnly: Story = {
  name: "Without image · dealCount only",
  args: {
    label: "Brakes",
    to: "/deals/c/components-brakes",
    dealCount: 42,
  },
};

export const WithImage: Story = {
  args: {
    label: "Bikes",
    to: "/deals?category=bikes",
    imageSrc: "/stock-bikes.jpg",
  },
};
