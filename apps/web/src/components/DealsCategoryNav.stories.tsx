import type { Meta, StoryObj } from "@storybook/react";
import type { CategoryTreeNode } from "../api";
import { DealsCategoryNavInner } from "./DealsCategoryNav";

function leaf(
  partial: Pick<CategoryTreeNode, "id" | "slug" | "name" | "parent_id" | "sort_order" | "depth"> &
    Partial<CategoryTreeNode>,
): CategoryTreeNode {
  return {
    deal_count: 4,
    product_count: 4,
    children: [],
    ...partial,
  };
}

const tree: CategoryTreeNode[] = [
  {
    id: 1,
    slug: "bikes",
    name: "Bikes",
    parent_id: null,
    sort_order: 0,
    depth: 0,
    deal_count: 40,
    product_count: 40,
    children: [
      {
        id: 2,
        slug: "bikes-mountain",
        name: "Mountain",
        parent_id: 1,
        sort_order: 0,
        depth: 1,
        deal_count: 24,
        product_count: 24,
        children: [
          leaf({
            id: 10,
            slug: "bikes-mountain-xc",
            name: "XC",
            parent_id: 2,
            sort_order: 0,
            depth: 2,
            product_count: 6,
            deal_count: 6,
          }),
          leaf({
            id: 11,
            slug: "bikes-mountain-trail",
            name: "Trail",
            parent_id: 2,
            sort_order: 1,
            depth: 2,
            product_count: 8,
            deal_count: 8,
          }),
          leaf({
            id: 12,
            slug: "bikes-mountain-enduro",
            name: "Enduro",
            parent_id: 2,
            sort_order: 2,
            depth: 2,
            product_count: 5,
            deal_count: 5,
          }),
          leaf({
            id: 13,
            slug: "bikes-mountain-downhill",
            name: "Downhill",
            parent_id: 2,
            sort_order: 3,
            depth: 2,
            product_count: 3,
            deal_count: 3,
          }),
          leaf({
            id: 14,
            slug: "bikes-mountain-dirt-jump",
            name: "Dirt Jump",
            parent_id: 2,
            sort_order: 4,
            depth: 2,
            product_count: 2,
            deal_count: 2,
          }),
          leaf({
            id: 15,
            slug: "bikes-mountain-parts",
            name: "Mountain parts",
            parent_id: 2,
            sort_order: 5,
            depth: 2,
            hide_from_nav: true,
            product_count: 1,
            deal_count: 1,
          }),
        ],
      },
    ],
  },
  {
    id: 3,
    slug: "components",
    name: "Components",
    parent_id: null,
    sort_order: 1,
    depth: 0,
    deal_count: 8,
    product_count: 8,
    children: [
      {
        id: 4,
        slug: "components-brakes",
        name: "Brakes",
        parent_id: 3,
        sort_order: 0,
        depth: 1,
        deal_count: 3,
        product_count: 3,
        children: [
          leaf({
            id: 5,
            slug: "components-brakes-disc",
            name: "Disc brakes",
            parent_id: 4,
            sort_order: 0,
            depth: 2,
            product_count: 2,
            deal_count: 2,
          }),
          leaf({
            id: 16,
            slug: "components-brakes-pads",
            name: "Pads",
            parent_id: 4,
            sort_order: 1,
            depth: 2,
            product_count: 1,
            deal_count: 1,
          }),
        ],
      },
    ],
  },
  leaf({
    id: 6,
    slug: "gear",
    name: "Gear",
    parent_id: null,
    sort_order: 2,
    depth: 0,
    product_count: 4,
    deal_count: 4,
  }),
];

const meta = {
  title: "Components/DealsCategoryNav",
  component: DealsCategoryNavInner,
  parameters: { layout: "padded" },
  args: {
    categoryTree: tree,
    categoryFilter: "",
    searchParams: new URLSearchParams(),
  },
} satisfies Meta<typeof DealsCategoryNavInner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const BrowseChipsAtRoot: Story = {
  name: "Browse chips at root",
  args: {
    categoryFilter: "",
    searchParams: new URLSearchParams(),
  },
};

export const CategoryWithChildren: Story = {
  name: "Parent category shows children",
  args: {
    categoryFilter: "bikes-mountain",
    searchParams: new URLSearchParams(),
  },
};

export const LeafWithSiblings: Story = {
  name: "Leaf shows parent and siblings",
  args: {
    categoryFilter: "bikes-mountain-trail",
    searchParams: new URLSearchParams("q=hydraulic"),
  },
};

export const DeepCategory: Story = {
  name: "Nested leaf preserves filters",
  args: {
    categoryFilter: "components-brakes-disc",
    searchParams: new URLSearchParams("q=hydraulic"),
  },
};

export const RootLeaf: Story = {
  name: "Top-level leaf highlights itself",
  args: {
    categoryFilter: "gear",
    searchParams: new URLSearchParams(),
  },
};
