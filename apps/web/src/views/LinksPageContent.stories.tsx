import type { Meta, StoryObj } from "@storybook/react";
import { LinksPageContent } from "./LinksPageContent";

const meta = {
  title: "Views/LinksPageContent",
  component: LinksPageContent,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof LinksPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
