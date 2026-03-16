import type { Meta, StoryObj } from "@storybook/react";
import { Pagination } from "./Pagination";

const meta = {
  title: "Components/Pagination",
  component: Pagination,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    totalCount: { control: "number" },
    limit: { control: "number" },
    offset: { control: "number" },
  },
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    totalCount: 150,
    limit: 24,
    offset: 0,
    onPageChange: (offset) => console.log("Page change:", offset),
  },
};

export const FirstPage: Story = {
  args: {
    totalCount: 100,
    limit: 24,
    offset: 0,
    onPageChange: () => {},
  },
};

export const MiddlePage: Story = {
  args: {
    totalCount: 100,
    limit: 24,
    offset: 48,
    onPageChange: () => {},
  },
};

export const LastPage: Story = {
  args: {
    totalCount: 50,
    limit: 24,
    offset: 24,
    onPageChange: () => {},
  },
};

export const SinglePage: Story = {
  args: {
    totalCount: 10,
    limit: 24,
    offset: 0,
    onPageChange: () => {},
  },
};
