/* eslint-disable @next/next/no-img-element */

import type { Meta, StoryObj } from "@storybook/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./card";
import { Button } from "./button";

const meta = {
  title: "Components/UI/Card",
  component: Card,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["default", "sm"],
    },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Optional description for the card content.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Card content goes here. Use CardHeader, CardContent, and CardFooter for
          structured layouts.
        </p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Action</Button>
      </CardFooter>
    </Card>
  ),
};

export const WithImage: Story = {
  render: (args) => (
    <Card {...args} className="w-[350px] overflow-hidden">
      <img
        src="https://placehold.co/350x200/1a1a1a/fff?text=Product"
        alt="Placeholder"
        className="w-full object-cover"
      />
      <CardHeader>
        <CardTitle>Product Name</CardTitle>
        <CardDescription>Mountain bike component or accessory</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">$299.99</p>
      </CardContent>
      <CardFooter>
        <Button>View Deal</Button>
      </CardFooter>
    </Card>
  ),
};

export const Small: Story = {
  render: (args) => (
    <Card {...args} size="sm" className="w-[280px]">
      <CardHeader>
        <CardTitle>Compact Card</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Smaller padding and gaps.</p>
      </CardContent>
    </Card>
  ),
};

export const HeaderOnly: Story = {
  render: (args) => (
    <Card {...args} className="w-[350px]">
      <CardHeader>
        <CardTitle>Simple Card</CardTitle>
        <CardDescription>No content or footer.</CardDescription>
      </CardHeader>
    </Card>
  ),
};
