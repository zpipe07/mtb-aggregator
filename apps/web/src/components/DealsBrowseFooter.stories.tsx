import type { Meta, StoryObj } from "@storybook/react";
import type { CategoryTreeNode } from "../api";
import { DealsBrowseFooterInner } from "./DealsBrowseFooter";

const tree: CategoryTreeNode[] = [
  {
    id: 1,
    slug: "bikes",
    name: "Bikes",
    parent_id: null,
    sort_order: 0,
    depth: 0,
    deal_count: 10,
    children: [],
  },
  {
    id: 2,
    slug: "components",
    name: "Components",
    parent_id: null,
    sort_order: 1,
    depth: 0,
    deal_count: 8,
    children: [],
  },
  {
    id: 3,
    slug: "gear",
    name: "Gear",
    parent_id: null,
    sort_order: 2,
    depth: 0,
    deal_count: 4,
    children: [],
  },
];

const meta = {
  title: "Components/DealsBrowseFooter",
  component: DealsBrowseFooterInner,
  parameters: { layout: "padded" },
  args: {
    rootCategories: tree,
    categoryTree: tree,
    searchParams: new URLSearchParams(),
  },
} satisfies Meta<typeof DealsBrowseFooterInner>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Department links only; matches `/deals` with no filters. */
export const Default: Story = {};

/** Preserves non-category query params on each department `href`. */
export const WithSearchAndSort: Story = {
  args: {
    searchParams: new URLSearchParams("q=fork&sort=discount"),
  },
};
