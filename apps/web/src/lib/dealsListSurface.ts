/** Surface for analytics when the user interacts from a deals listing context. */
export type DealsListSurface =
  | "hub"
  | "category"
  | "deals_list"
  | "home"
  | "blog"
  | "other";

export function dealsListSurfaceFromPathname(
  pathname: string | null | undefined,
): DealsListSurface {
  if (!pathname) return "other";
  if (pathname.startsWith("/deals/hub/")) return "hub";
  if (pathname.startsWith("/deals/c/")) return "category";
  if (pathname === "/deals") return "deals_list";
  if (pathname === "/") return "home";
  if (pathname === "/blog" || pathname.startsWith("/blog/")) return "blog";
  return "other";
}

/** Parse pathname from a deals list href (may include query). */
export function dealsListSurfaceFromListHref(
  href: string | null | undefined,
): DealsListSurface {
  if (!href) return "other";
  try {
    const u = new URL(href, "http://localhost");
    return dealsListSurfaceFromPathname(u.pathname);
  } catch {
    return "other";
  }
}
