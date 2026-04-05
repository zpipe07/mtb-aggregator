import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import categoriesExport from "../../../packages/shared/categories.export.json";
import { buildCategoryTreeFromFlat, type CategoryFlatRow } from "@/lib/categoryTree";
import { buildDealsCategoryPath } from "@/lib/dealsCategoryPath";

/** Snapshot for URL building when middleware runs (no API fetch). Regenerate export when taxonomy changes. */
const middlewareCategoryTree = buildCategoryTreeFromFlat(
  categoriesExport.categories as CategoryFlatRow[],
);

/**
 * 308 redirect `/deals?category=<slug>` → `/deals/c/...` so category URLs stay canonical.
 * Other query params (q, brand, …) are preserved.
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname !== "/deals") {
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
  matcher: ["/deals"],
};
