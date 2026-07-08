import posthog from "posthog-js";

export type CategoryNavSource =
  | "breadcrumb"
  | "chip"
  | "all_clear"
  | "mega_menu";

export function captureCategoryNav(slug: string, navSource: CategoryNavSource) {
  posthog.capture("filter_applied", {
    filter_type: "category",
    value: slug || "",
    nav_source: navSource,
    ...(slug ? { category_slug: slug } : {}),
  });
}
