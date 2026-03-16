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
  },
} satisfies Meta<typeof CategoryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Mountain Bikes",
    to: "/deals?category=bikes-mountain",
  },
};

export const WithDescription: Story = {
  args: {
    label: "E-Bikes",
    to: "/deals?category=bikes-electric",
    description: "Electric mountain bikes and accessories",
  },
};
