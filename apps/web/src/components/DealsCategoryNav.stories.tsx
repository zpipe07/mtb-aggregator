import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import type { CategoryTreeNode } from "../api";
import { DealsCategoryNav } from "./DealsCategoryNav";

const tree: CategoryTreeNode[] = [
  {
    id: 1,
    slug: "bikes",
    name: "Bikes",
    parent_id: null,
    sort_order: 0,
    depth: 0,
    children: [
      {
        id: 2,
        slug: "bikes-mountain",
        name: "Mountain",
        parent_id: 1,
        sort_order: 0,
        depth: 1,
        children: [],
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
    children: [
      {
        id: 4,
        slug: "components-brakes",
        name: "Brakes",
        parent_id: 3,
        sort_order: 0,
        depth: 1,
        children: [
          {
            id: 5,
            slug: "components-brakes-disc",
            name: "Disc brakes",
            parent_id: 4,
            sort_order: 0,
            depth: 2,
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: 6,
    slug: "gear",
    name: "Gear",
    parent_id: null,
    sort_order: 2,
    depth: 0,
    children: [],
  },
];

function InteractiveWrapper({
  initialSlug = "",
}: {
  initialSlug?: string;
}) {
  const [slug, setSlug] = useState(initialSlug);
  return (
    <div className="max-w-md">
      <DealsCategoryNav
        categoryTree={tree}
        categoryFilter={slug}
        onCategoryChange={(s) => {
          setSlug(s);
        }}
      />
      <p className="mt-4 text-xs text-muted-foreground">
        Current slug: <code>{slug || "(none)"}</code>
      </p>
    </div>
  );
}

const noop = () => {};

const meta = {
  title: "Components/DealsCategoryNav",
  component: DealsCategoryNav,
  parameters: { layout: "padded" },
  args: {
    categoryTree: tree,
    categoryFilter: "",
    onCategoryChange: noop,
  },
} satisfies Meta<typeof DealsCategoryNav>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RootLevel: Story = {
  render: () => <InteractiveWrapper />,
};

export const DrilledIntoComponents: Story = {
  render: () => <InteractiveWrapper initialSlug="components" />,
};

export const DeepLeaf: Story = {
  render: () => <InteractiveWrapper initialSlug="components-brakes-disc" />,
};
