import type { CategoryTreeNode } from "@/api";
import { findCategoryBySlug } from "@/lib/categoryTree";
import { parseCategorySlugFromDealsPath } from "@/lib/dealsCategoryPath";
import { getSeoHubBySlug } from "@/lib/seoHubs";

/**
 * Build `/deals` list path from Next.js page `searchParams` (same shape as `await searchParams`).
 */
export function searchParamsRecordToDealsListPath(
  record: Record<string, string | string[] | undefined>
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (v !== "") qs.append(key, v);
      });
    } else {
      qs.set(key, value);
    }
  }
  const s = qs.toString();
  return s ? `/deals?${s}` : "/deals";
}

/**
 * Build deals list path for `/deals/c/...` routes: pathname + query (category is in the path, not `category=`).
 */
export function searchParamsRecordToDealsCategoryListPath(
  pathname: string,
  record: Record<string, string | string[] | undefined>
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (key === "category") continue;
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (v !== "") qs.append(key, v);
      });
    } else {
      qs.set(key, value);
    }
  }
  const s = qs.toString();
  return s ? `${pathname}?${s}` : pathname;
}

/** Safe internal back target for deal detail "Back to deals" (`/deals`, `/deals?...`, `/deals/c/...`, or `/deals/hub/...`). */
export function sanitizeDealsListBackHref(
  raw: string | null | undefined
): string {
  if (raw == null || raw === "") return "/deals";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // use raw
  }
  try {
    const u = new URL(decoded, "http://localhost");
    if (
      u.pathname === "/deals" ||
      u.pathname.startsWith("/deals/c/") ||
      u.pathname.startsWith("/deals/hub/") ||
      u.pathname.startsWith("/deals/brand/")
    ) {
      return `${u.pathname}${u.search}`;
    }
    return "/deals";
  } catch {
    return "/deals";
  }
}

/** Canonical deal detail URL (back context stored in sessionStorage on click). */
export function buildDealDetailHref(dealId: number, _dealsListPath?: string): string {
  return `/deals/${dealId}`;
}

/** Contextual label for deal detail "Back to deals" from a sanitized list href. */
export function dealsListBackLabel(
  href: string,
  categoryTree?: CategoryTreeNode[] | null,
): string {
  try {
    const pathname = new URL(href, "http://localhost").pathname;

    if (pathname.startsWith("/deals/c/")) {
      const slug = parseCategorySlugFromDealsPath(pathname);
      if (slug && categoryTree?.length) {
        const node = findCategoryBySlug(categoryTree, slug);
        if (node) return `← Back to ${node.name}`;
      }
      return "← Back to deals";
    }

    if (pathname.startsWith("/deals/hub/")) {
      const hubSlug = pathname.slice("/deals/hub/".length).replace(/\/$/, "");
      const hub = hubSlug ? getSeoHubBySlug(hubSlug) : undefined;
      if (hub) return `← Back to ${hub.title}`;
      return "← Back to deals";
    }

    if (pathname.startsWith("/deals/brand/")) {
      const rest = pathname.slice("/deals/brand/".length).replace(/\/$/, "");
      const brandSlug = rest.split("/c/")[0];
      if (brandSlug) {
        const label = brandSlug.replace(/-/g, " ");
        return `← Back to ${label.charAt(0).toUpperCase()}${label.slice(1)} deals`;
      }
      return "← Back to deals";
    }

    return "← Back to deals";
  } catch {
    return "← Back to deals";
  }
}

/**
 * True when the category browse URL would send the user to the same deals list
 * path as "Back to deals" (only pathname compared; query on `backHref` ignored).
 */
export function isCategoryBrowseRedundantWithBack(
  backHref: string,
  categoryBrowseHref: string | undefined,
): boolean {
  if (!categoryBrowseHref) return false;
  try {
    const back = new URL(backHref, "http://localhost");
    const cat = new URL(categoryBrowseHref, "http://localhost");
    return back.pathname === cat.pathname;
  } catch {
    return false;
  }
}
