import type { CategoryTreeNode } from "@/api";
import { findCategoryWithAncestors } from "./categoryTree";

const DEALS_CATEGORY_PREFIX = "/deals/c";

/**
 * Legacy URL builder: splits the slug on `-` into path segments.
 * Wrong when a single segment contains hyphens (e.g. `wheels-tires` under `components`).
 * Prefer {@link buildDealsCategoryPath} with a category tree when available.
 */
export function buildDealsCategoryPathLegacy(categorySlug: string): string {
  const s = categorySlug.trim();
  if (!s) return "/deals";
  return `${DEALS_CATEGORY_PREFIX}/${s.split("-").join("/")}`;
}

/**
 * URL path segments for a category slug using the tree (parent slug prefixes).
 * Returns null if the slug is not found in the tree.
 */
export function urlSegmentsForCategorySlug(
  categorySlug: string,
  tree: CategoryTreeNode[],
): string[] | null {
  const trimmed = categorySlug.trim();
  if (!trimmed) return null;
  const found = findCategoryWithAncestors(tree, trimmed);
  if (!found) return null;
  const chain = [...found.ancestors, found.node];
  const segments: string[] = [];
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    if (i === 0) {
      segments.push(node.slug);
    } else {
      const parent = chain[i - 1];
      segments.push(node.slug.slice(parent.slug.length + 1));
    }
  }
  return segments;
}

/**
 * Public URL path for a category slug (e.g. `bikes-electric` → `/deals/c/bikes/electric`).
 * When `categoryTree` is provided, segments are derived from ancestry so multi-word
 * segments (e.g. `dirt-jump`, `wheels-tires`) stay a single path segment.
 * Otherwise falls back to {@link buildDealsCategoryPathLegacy}.
 */
export function buildDealsCategoryPath(
  categorySlug: string,
  categoryTree?: CategoryTreeNode[] | null,
): string {
  const s = categorySlug.trim();
  if (!s) return "/deals";
  if (categoryTree?.length) {
    const segments = urlSegmentsForCategorySlug(s, categoryTree);
    if (segments !== null) {
      return `${DEALS_CATEGORY_PREFIX}/${segments.join("/")}`;
    }
  }
  return buildDealsCategoryPathLegacy(s);
}

/** Every `/deals/c/...` path for nodes in the category tree (depth-first). */
export function allDealsCategoryPathsFromTree(tree: CategoryTreeNode[]): string[] {
  const out: string[] = [];
  function walk(nodes: CategoryTreeNode[]) {
    for (const n of nodes) {
      out.push(buildDealsCategoryPath(n.slug, tree));
      if (n.children?.length) walk(n.children);
    }
  }
  walk(tree);
  return out;
}

/**
 * Parse category slug from pathname when under `/deals/c/...`.
 * Returns `null` for `/deals`, `/deals/123`, or invalid `/deals/c` without segments.
 */
export function parseCategorySlugFromDealsPath(pathname: string): string | null {
  if (!pathname.startsWith(`${DEALS_CATEGORY_PREFIX}/`)) return null;
  const rest = pathname.slice(DEALS_CATEGORY_PREFIX.length + 1);
  if (!rest) return null;
  const segments = rest.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  return segments.join("-");
}
