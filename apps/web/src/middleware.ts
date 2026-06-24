import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import categoriesExport from "../../../packages/shared/categories.export.json";
import { buildCategoryTreeFromFlat, type CategoryFlatRow } from "@/lib/categoryTree";
import { buildDealsCategoryPath } from "@/lib/dealsCategoryPath";

/** Snapshot for URL building when middleware runs (no API fetch). Regenerate export when taxonomy changes. */
const middlewareCategoryTree = buildCategoryTreeFromFlat(
  categoriesExport.categories as CategoryFlatRow[],
);

const DEAL_DETAIL_PATH = /^\/deals\/(\d+)$/;

/**
 * Canonical URL hygiene:
 * - `/deals?category=<slug>` → `/deals/c/...`
 * - `/deals/[id]?from=...` → `/deals/[id]` (back nav uses sessionStorage)
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const dealMatch = pathname.match(DEAL_DETAIL_PATH);
  if (dealMatch && request.nextUrl.searchParams.has("from")) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("from");
    return NextResponse.redirect(url, 308);
  }

  if (pathname !== "/deals") {
    return NextResponse.next();
  }

  const cat = request.nextUrl.searchParams.get("category");
  if (!cat || !cat.trim()) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = buildDealsCategoryPath(cat.trim(), middlewareCategoryTree);
  url.searchParams.delete("category");
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/deals", "/deals/:path*"],
};
