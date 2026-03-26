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

/**
 * Nodes to show as chips: top-level roots when nothing selected;
 * otherwise direct children of the selected category.
 */
export function getBrowseChildNodes(
  tree: CategoryTreeNode[],
  selectedSlug: string,
): CategoryTreeNode[] {
  if (!selectedSlug) {
    return sortNodes(tree);
  }
  const found = findCategoryBySlug(tree, selectedSlug);
  if (!found?.children?.length) return [];
  return sortNodes(found.children);
}
