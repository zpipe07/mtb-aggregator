import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildDealsCategoryPath } from "@/lib/dealsCategoryPath";

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
  url.pathname = buildDealsCategoryPath(cat.trim());
  url.searchParams.delete("category");
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/deals"],
};
