import type { Meta, StoryObj } from "@storybook/react";
import { Select } from "./select";

const meta = {
  title: "Components/UI/Select",
  component: Select,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

const sortOptions = (
  <>
    <option value="">Choose an option</option>
    <option value="newest">Newest</option>
    <option value="discount">Highest discount</option>
    <option value="price_asc">Price: low to high</option>
    <option value="price_desc">Price: high to low</option>
  </>
);

export const Default: Story = {
  render: (args) => <Select {...args}>{sortOptions}</Select>,
  args: {},
};

export const WithValue: Story = {
  render: (args) => <Select {...args}>{sortOptions}</Select>,
  args: {
    defaultValue: "discount",
  },
};

export const Disabled: Story = {
  render: (args) => (
    <Select {...args}>
      <option value="">Disabled select</option>
    </Select>
  ),
  args: {
    disabled: true,
  },
};
