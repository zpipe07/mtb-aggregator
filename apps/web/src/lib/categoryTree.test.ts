import { describe, it, expect } from "vitest";
import type { CategoryTreeNode } from "../api";
import {
  categoryHasDeals,
  categoryNavDealCount,
  filterCategoryTreeForNav,
  normalizeCategoryTree,
  shopperListingTotalCount,
} from "./categoryTree";

function node(
  partial: Partial<CategoryTreeNode> & Pick<CategoryTreeNode, "deal_count">,
): CategoryTreeNode {
  return {
    id: 1,
    slug: "bikes",
    name: "Bikes",
    parent_id: null,
    sort_order: 0,
    depth: 0,
    children: [],
    ...partial,
  };
}

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

describe("categoryNavDealCount", () => {
  it("prefers product_count so homepage tiles match mega-menu (ZAC-236)", () => {
    expect(
      categoryNavDealCount(node({ deal_count: 1960, product_count: 754 })),
    ).toBe(754);
  });

  it("falls back to deal_count when product_count is missing (older API)", () => {
    expect(categoryNavDealCount(node({ deal_count: 42 }))).toBe(42);
  });

  it("returns 0 when both counts are zero", () => {
    expect(
      categoryNavDealCount(node({ deal_count: 0, product_count: 0 })),
    ).toBe(0);
  });
});

describe("shopperListingTotalCount", () => {
  const helmets = node({
    slug: "gear-helmets",
    name: "Helmets",
    deal_count: 845,
    product_count: 843,
  });

  it("uses the tree product_count on an unfiltered category listing (ZAC-268)", () => {
    expect(shopperListingTotalCount(7532, helmets, false)).toBe(843);
  });

  it("keeps the live deals total when extra filters are applied", () => {
    expect(shopperListingTotalCount(120, helmets, true)).toBe(120);
  });

  it("keeps the deals total when no category node is available", () => {
    expect(shopperListingTotalCount(187, null, false)).toBe(187);
  });
});

describe("filterCategoryTreeForNav", () => {
  it("drops hide_from_nav nodes and their descendants (ZAC-251)", () => {
    const tree = [
      node({
        id: 1,
        slug: "gear",
        name: "Gear",
        deal_count: 10,
        product_count: 8,
        children: [
          node({
            id: 2,
            slug: "gear-helmets",
            name: "Helmets",
            parent_id: 1,
            depth: 1,
            deal_count: 5,
            product_count: 4,
          }),
          node({
            id: 3,
            slug: "gear-helmet-parts",
            name: "Helmet parts",
            parent_id: 1,
            depth: 1,
            hide_from_nav: true,
            deal_count: 2,
            product_count: 2,
            children: [
              node({
                id: 4,
                slug: "gear-helmet-parts-visors",
                name: "Visors",
                parent_id: 3,
                depth: 2,
                deal_count: 1,
                product_count: 1,
              }),
            ],
          }),
        ],
      }),
    ];

    const filtered = filterCategoryTreeForNav(tree);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].children.map((c) => c.slug)).toEqual(["gear-helmets"]);
    // Parent rollup is unchanged so mega-menu and search chips agree (ZAC-268).
    expect(categoryNavDealCount(filtered[0])).toBe(8);
    expect(categoryNavDealCount(tree[0])).toBe(8);
  });

  it("omits a hidden root and treats missing hide_from_nav as visible", () => {
    const tree = [
      node({
        id: 1,
        slug: "bikes",
        name: "Bikes",
        hide_from_nav: true,
        deal_count: 3,
      }),
      node({
        id: 2,
        slug: "components",
        name: "Components",
        deal_count: 4,
      }),
    ];

    expect(filterCategoryTreeForNav(tree).map((n) => n.slug)).toEqual([
      "components",
    ]);
  });
});

describe("categoryHasDeals", () => {
  it("uses product_count when listings exist but grouped deals do not", () => {
    expect(
      categoryHasDeals(node({ deal_count: 12, product_count: 0 })),
    ).toBe(false);
  });

  it("is true when grouped deals exist", () => {
    expect(
      categoryHasDeals(node({ deal_count: 12, product_count: 3 })),
    ).toBe(true);
  });

  it("falls back to deal_count when product_count is missing", () => {
    expect(categoryHasDeals(node({ deal_count: 5 }))).toBe(true);
    expect(categoryHasDeals(node({ deal_count: 0 }))).toBe(false);
  });
});
