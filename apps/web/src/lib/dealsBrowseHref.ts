import type { CategoryTreeNode } from "@/api";
import { buildDealsCategoryPath } from "./dealsCategoryPath";

/**
 * Build `/deals` or `/deals/c/...` with non-category query params preserved
 * (`q`, `store`, `brand`, `sort`, `offset`, `min_discount`, `spec_*`, `variant_*`).
 * Omits `category` (path carries the category).
 */
export function buildDealsBrowseHref(
  categorySlug: string,
  searchParams: URLSearchParams,
  categoryTree?: CategoryTreeNode[] | null,
): string {
  const qs = new URLSearchParams(searchParams.toString());
  qs.delete("category");
  const s = qs.toString();
  const path = categorySlug
    ? buildDealsCategoryPath(categorySlug, categoryTree)
    : "/deals";
  return s ? `${path}?${s}` : path;
}
