import type { Meta, StoryObj } from "@storybook/react";
import { NotFoundContent } from "./NotFoundContent";

const meta = {
  title: "Components/NotFoundContent",
  component: NotFoundContent,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof NotFoundContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
