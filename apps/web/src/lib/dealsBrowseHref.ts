import type { CategoryTreeNode } from "@/api";
import { buildDealsCategoryPath } from "./dealsCategoryPath";

/**
 * Build `/deals` or `/deals/c/...` with non-category query params preserved
 * (`q`, `store`, `brand`, `sort`, `min_discount`, `spec_*`).
 * Omits `category` (path carries the category) and `offset` (category nav → page 1).
 */
export function buildDealsBrowseHref(
  categorySlug: string,
  searchParams: URLSearchParams,
  categoryTree?: CategoryTreeNode[] | null,
): string {
  const qs = new URLSearchParams(searchParams.toString());
  qs.delete("category");
  qs.delete("offset");
  const s = qs.toString();
  const path = categorySlug
    ? buildDealsCategoryPath(categorySlug, categoryTree)
    : "/deals";
  return s ? `${path}?${s}` : path;
}
