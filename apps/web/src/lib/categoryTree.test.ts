import { describe, it, expect } from "vitest";
import type { CategoryTreeNode } from "../api";
import { normalizeCategoryTree } from "./categoryTree";

describe("normalizeCategoryTree", () => {
  it("fills missing children arrays on leaf nodes", () => {
    const raw = [
      {
        id: 1,
        slug: "bikes",
        name: "Bikes",
        parent_id: null,
        sort_order: 0,
        depth: 0,
        deal_count: 5,
        children: [
          {
            id: 2,
            slug: "bikes-mountain",
            name: "Mountain",
            parent_id: 1,
            sort_order: 0,
            depth: 1,
            deal_count: 3,
          } as CategoryTreeNode,
        ],
      } as CategoryTreeNode,
    ];

    const tree = normalizeCategoryTree(raw);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].children).toEqual([]);
  });

  it("returns empty array for nullish input", () => {
    expect(normalizeCategoryTree(null)).toEqual([]);
    expect(normalizeCategoryTree(undefined)).toEqual([]);
  });
});
