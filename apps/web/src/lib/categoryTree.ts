import type { CategoryTreeNode } from "../api";

/** Flat category row (API list or `categories.export.json`) before nesting. */
export type CategoryFlatRow = {
  id: number;
  slug: string;
  name: string;
  parent_id: number | null;
  sort_order: number;
  depth: number;
};

/**
 * Build a nested tree from flat rows (same shape as `GET /categories/tree` / DB list).
 * Order matches API: depth, sort_order, id.
 */
export function buildCategoryTreeFromFlat(flat: CategoryFlatRow[]): CategoryTreeNode[] {
  const list = [...flat].sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });

  function build(parentId: number | null): CategoryTreeNode[] {
    const nodes: CategoryTreeNode[] = [];
    for (const c of list) {
      const match =
        parentId === null ? c.parent_id === null : c.parent_id === parentId;
      if (!match) continue;
      nodes.push({
        id: c.id,
        slug: c.slug,
        name: c.name,
        parent_id: c.parent_id,
        sort_order: c.sort_order,
        depth: c.depth,
        deal_count: 0,
        product_count: 0,
        children: build(c.id),
      });
    }
    return nodes;
  }

  return build(null);
}

/**
 * Shopper-facing deal count for a nav node: grouped products as shown on
 * `/deals?group_variants=true`. Homepage tiles, mega-menu, search chips,
 * the categories hub, and unfiltered listing headers must use this so the
 * numbers agree (ZAC-236, ZAC-268).
 * Older APIs omit `product_count`; fall back to the listing rollup.
 */
export function categoryNavDealCount(node: CategoryTreeNode): number {
  return node.product_count ?? node.deal_count ?? 0;
}

/**
 * Listing header / pagination total for a category surface.
 * Unfiltered category pages use the tree count so mega-menu, chips, and
 * `/deals/c/...` agree. Extra filters (search, brand, price, specs, …)
 * keep the live `GET /deals` total.
 */
export function shopperListingTotalCount(
  dealsTotal: number,
  categoryNode: CategoryTreeNode | null | undefined,
  hasExtraFilters: boolean,
): number {
  if (!hasExtraFilters && categoryNode) {
    return categoryNavDealCount(categoryNode);
  }
  return dealsTotal;
}

/** True when this subtree has at least one deal shoppers would see. */
export function categoryHasDeals(node: CategoryTreeNode): boolean {
  return categoryNavDealCount(node) > 0;
}

/**
 * API leaf nodes omit `children` (`json:"children,omitempty"`). Ensure every node has
 * `children: []` so tree walkers can safely read `.length` without optional chaining.
 */
export function normalizeCategoryTree(
  tree: CategoryTreeNode[] | null | undefined,
): CategoryTreeNode[] {
  if (!tree?.length) return [];
  return tree.map((node) => ({
    ...node,
    children: normalizeCategoryTree(node.children),
  }));
}

/**
 * Keep only categories with shopper-facing deals (`product_count`, falling back
 * to `deal_count`), recursively. Used for sitemap and other “only show categories
 * that have inventory” cases. Navigation still uses the full tree when resolving
 * the current slug (including empty category pages).
 */
export function filterCategoryTreeWithDeals(
  tree: CategoryTreeNode[],
): CategoryTreeNode[] {
  const out: CategoryTreeNode[] = [];
  for (const n of tree) {
    if (!categoryHasDeals(n)) continue;
    const children = n.children?.length
      ? filterCategoryTreeWithDeals(n.children)
      : [];
    out.push({ ...n, children });
  }
  return out;
}

/**
 * Drop categories flagged `hide_from_nav` (and their descendants) for the
 * header mega-menu. `/categories`, the root `/deals` browse chips, and
 * classification still use the full tree (ZAC-251). In-category browse chips
 * omit hidden nodes themselves (ZAC-315); see {@link selectDealsBrowseChips}.
 */
export function filterCategoryTreeForNav(
  tree: CategoryTreeNode[],
): CategoryTreeNode[] {
  const out: CategoryTreeNode[] = [];
  for (const n of tree) {
    if (n.hide_from_nav) continue;
    const children = n.children?.length
      ? filterCategoryTreeForNav(n.children)
      : [];
    out.push({ ...n, children });
  }
  return out;
}

/**
 * Map API `canonical_category` (e.g. `["Bikes", "Electric"]`) to a `categories.slug`
 * by walking the tree and matching names at each depth. Returns null if no match.
 */
export function categorySlugFromCanonicalPath(
  tree: CategoryTreeNode[],
  canonical: string[] | undefined | null
): string | null {
  if (!canonical?.length) return null;
  const target = canonical.map((s) => s.trim().toLowerCase());

  function walk(nodes: CategoryTreeNode[], depth: number): string | null {
    for (const n of nodes) {
      if (n.name.trim().toLowerCase() !== target[depth]) continue;
      if (depth === target.length - 1) return n.slug;
      const deeper = walk(n.children ?? [], depth + 1);
      if (deeper) return deeper;
    }
    return null;
  }

  return walk(tree, 0);
}

/** Display label for breadcrumbs: `Parent › Child`. */
export function categoryPathLabelFromSlug(
  tree: CategoryTreeNode[],
  slug: string
): string | null {
  const found = findCategoryWithAncestors(tree, slug);
  if (!found) return null;
  return [...found.ancestors.map((a) => a.name), found.node.name].join(" › ");
}

/** Depth-first search for a category by slug. */
export function findCategoryBySlug(
  tree: CategoryTreeNode[],
  slug: string,
): CategoryTreeNode | null {
  if (!slug) return null;
  for (const node of tree) {
    if (node.slug === slug) return node;
    if (node.children?.length) {
      const found = findCategoryBySlug(node.children, slug);
      if (found) return found;
    }
  }
  return null;
}

/** Selected node and ancestors from root (ancestors exclude the node itself). */
export function findCategoryWithAncestors(
  tree: CategoryTreeNode[],
  slug: string,
): { node: CategoryTreeNode; ancestors: CategoryTreeNode[] } | null {
  if (!slug) return null;

  function walk(
    nodes: CategoryTreeNode[],
    prefix: CategoryTreeNode[],
  ): { node: CategoryTreeNode; ancestors: CategoryTreeNode[] } | null {
    for (const node of nodes) {
      if (node.slug === slug) {
        return { node, ancestors: prefix };
      }
      if (node.children?.length) {
        const r = walk(node.children, [...prefix, node]);
        if (r) return r;
      }
    }
    return null;
  }

  return walk(tree, []);
}

/** Sort siblings by API sort_order, then id. */
function sortNodes(nodes: CategoryTreeNode[]): CategoryTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });
}

export type CategoryChipMode = "roots" | "children" | "siblings";

/** Root `/deals` chip row stops here; "See all" covers the rest. */
export const ROOT_BROWSE_CHIP_LIMIT = 8;

/**
 * Chips for the category row:
 * - **roots** — nothing selected (or an unknown slug): top-level categories.
 * - **children** — current category has subcategories: show them (drill down).
 * - **siblings** — current category is a leaf: show peers under the same parent
 *   so users can switch without going up (highlight matches `categoryFilter`).
 */
export function getBrowseChipNodes(
  tree: CategoryTreeNode[],
  selectedSlug: string,
): { nodes: CategoryTreeNode[]; mode: CategoryChipMode } {
  if (!selectedSlug) {
    return { nodes: sortNodes(tree), mode: "roots" };
  }
  const found = findCategoryWithAncestors(tree, selectedSlug);
  if (!found) {
    return { nodes: sortNodes(tree), mode: "roots" };
  }
  const { node, ancestors } = found;
  if (node.children?.length) {
    return { nodes: sortNodes(node.children), mode: "children" };
  }
  if (ancestors.length === 0) {
    return { nodes: sortNodes(tree), mode: "siblings" };
  }
  const parent = ancestors[ancestors.length - 1];
  return {
    nodes: sortNodes(parent.children ?? []),
    mode: "siblings",
  };
}

export type DealsBrowseChipRow = {
  mode: CategoryChipMode;
  /** Mono eyebrow, including the `//` prefix. */
  label: string;
  /** Step back to the parent. Set for a leaf that has one (ZAC-315). */
  parent: CategoryTreeNode | null;
  nodes: CategoryTreeNode[];
  /** Slug drawn as the current chip. Empty when none of the chips is current. */
  currentSlug: string;
  showSeeAll: boolean;
};

function shopperChipVisible(
  node: CategoryTreeNode,
  currentSlug: string,
  omitHiddenFromNav: boolean,
): boolean {
  if (currentSlug && node.slug === currentSlug) return true;
  if (omitHiddenFromNav && node.hide_from_nav) return false;
  return categoryHasDeals(node);
}

/**
 * Shopper chip row for `/deals` and category pages (ZAC-315).
 * Root rows keep the historical cap and still include `hide_from_nav` nodes.
 * Child and sibling rows drop hidden and empty categories, keep the current
 * leaf visible, and on a leaf include its parent as a step back.
 * Returns null when there is nothing to show.
 */
export function selectDealsBrowseChips(
  tree: CategoryTreeNode[],
  selectedSlug: string,
): DealsBrowseChipRow | null {
  if (!tree.length) return null;

  const { nodes, mode } = getBrowseChipNodes(tree, selectedSlug);
  const found = selectedSlug
    ? findCategoryWithAncestors(tree, selectedSlug)
    : null;

  if (mode === "roots") {
    const visible = nodes
      .filter((node) => shopperChipVisible(node, "", false))
      .slice(0, ROOT_BROWSE_CHIP_LIMIT);
    if (visible.length === 0) return null;
    return {
      mode,
      label: "// browse by category",
      parent: null,
      nodes: visible,
      currentSlug: "",
      showSeeAll: true,
    };
  }

  if (mode === "children") {
    const visible = nodes.filter((node) =>
      shopperChipVisible(node, "", true),
    );
    if (visible.length === 0 || !found) return null;
    return {
      mode,
      label: `// browse ${found.node.name}`,
      parent: null,
      nodes: visible,
      currentSlug: "",
      showSeeAll: false,
    };
  }

  const parent =
    found && found.ancestors.length > 0
      ? found.ancestors[found.ancestors.length - 1]
      : null;
  const visible = nodes.filter((node) =>
    shopperChipVisible(node, selectedSlug, true),
  );
  if (visible.length === 0 && !parent) return null;
  return {
    mode,
    label: parent ? `// in ${parent.name}` : "// browse by category",
    parent,
    nodes: visible,
    currentSlug: selectedSlug,
    showSeeAll: false,
  };
}
