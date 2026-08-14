import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import categoriesExport from "../../../packages/shared/categories.export.json";
import { buildCategoryTreeFromFlat, type CategoryFlatRow } from "@/lib/categoryTree";
import {
  redirectClothingCategorySlug,
  redirectClothingDealsPath,
} from "@/lib/clothingCategoryRedirects";
import { buildDealsCategoryPath } from "@/lib/dealsCategoryPath";

/** Snapshot for URL building when middleware runs (no API fetch). Regenerate export when taxonomy changes. */
const middlewareCategoryTree = buildCategoryTreeFromFlat(
  categoriesExport.categories as CategoryFlatRow[],
);

const DEAL_DETAIL_PATH = /^\/deals\/(\d+)$/;

/**
 * Canonical URL hygiene:
 * - `/deals/c/gear/clothing/tops|bottoms/...` → flattened paths (migration 037)
 * - `/deals?category=<slug>` → `/deals/c/...` (legacy slugs redirected first)
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

  const clothingPathRedirect = redirectClothingDealsPath(pathname);
  if (clothingPathRedirect) {
    const url = request.nextUrl.clone();
    url.pathname = clothingPathRedirect;
    return NextResponse.redirect(url, 308);
  }

  if (pathname !== "/deals") {
    return NextResponse.next();
  }

  const cat = request.nextUrl.searchParams.get("category");
  if (!cat || !cat.trim()) {
    return NextResponse.next();
  }

  const trimmed = cat.trim();
  const legacySlug = redirectClothingCategorySlug(trimmed);
  const slugForPath = legacySlug ?? trimmed;

  const url = request.nextUrl.clone();
  url.pathname = buildDealsCategoryPath(slugForPath, middlewareCategoryTree);
  url.searchParams.delete("category");
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/deals", "/deals/:path*"],
};
