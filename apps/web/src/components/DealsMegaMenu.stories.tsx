import type { Meta, StoryObj } from "@storybook/react";
import type { CategoryTreeNode } from "../api";
import { DealsMegaMenuPanel } from "./DealsMegaMenu";

const tree: CategoryTreeNode[] = [
  {
    id: 1,
    slug: "bikes",
    name: "Bikes",
    parent_id: null,
    sort_order: 0,
    depth: 0,
    deal_count: 10,
    product_count: 10,
    children: [
      {
        id: 2,
        slug: "bikes-mountain",
        name: "Mountain",
        parent_id: 1,
        sort_order: 0,
        depth: 1,
        deal_count: 5,
        product_count: 5,
        children: [
          {
            id: 7,
            slug: "bikes-mountain-trail",
            name: "Trail",
            parent_id: 2,
            sort_order: 0,
            depth: 2,
            deal_count: 2,
            product_count: 2,
            children: [],
          },
        ],
      },
      {
        id: 3,
        slug: "bikes-electric",
        name: "Electric",
        parent_id: 1,
        sort_order: 1,
        depth: 1,
        deal_count: 3,
        product_count: 3,
        children: [],
      },
    ],
  },
  {
    id: 4,
    slug: "components",
    name: "Components",
    parent_id: null,
    sort_order: 1,
    depth: 0,
    deal_count: 8,
    product_count: 8,
    children: [
      {
        id: 5,
        slug: "components-brakes",
        name: "Brakes",
        parent_id: 4,
        sort_order: 0,
        depth: 1,
        deal_count: 3,
        product_count: 3,
        children: [
          {
            id: 6,
            slug: "components-brakes-disc",
            name: "Disc brakes",
            parent_id: 5,
            sort_order: 0,
            depth: 2,
            deal_count: 2,
            product_count: 2,
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: 8,
    slug: "gear",
    name: "Gear",
    parent_id: null,
    sort_order: 2,
    depth: 0,
    deal_count: 4,
    product_count: 4,
    children: [],
  },
];

const meta = {
  title: "Components/DealsMegaMenu",
  component: DealsMegaMenuPanel,
  parameters: { layout: "fullscreen" },
  args: {
    categoryTree: tree,
  },
} satisfies Meta<typeof DealsMegaMenuPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onClose: () => undefined,
  },
};

export const WithActiveSecondLevel: Story = {
  args: {
    activeCategorySlug: "bikes-mountain-trail",
    onClose: () => undefined,
  },
};

export const EmptyTree: Story = {
  args: {
    categoryTree: [],
  },
};
