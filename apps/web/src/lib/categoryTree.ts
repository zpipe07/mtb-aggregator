import type { CategoryTreeNode } from "../api";

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

/** Sort siblings by API sort_order. */
function sortNodes(nodes: CategoryTreeNode[]): CategoryTreeNode[] {
  return [...nodes].sort((a, b) => a.sort_order - b.sort_order);
}

export type CategoryChipMode = "roots" | "children" | "siblings";

/**
 * Chips for the category row:
 * - **roots** — nothing selected: top-level categories.
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
