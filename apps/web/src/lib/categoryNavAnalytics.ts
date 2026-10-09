import posthog from "posthog-js";

export type CategoryNavSource =
  | "breadcrumb"
  | "chip"
  | "browse_chips"
  | "all_clear"
  | "mega_menu";

/** Which browse-chip control fired `nav_source: browse_chips`. */
export type BrowseChipMode = "roots" | "children" | "siblings" | "parent";

export function captureCategoryNav(
  slug: string,
  navSource: CategoryNavSource,
  chipMode?: BrowseChipMode,
) {
  posthog.capture("filter_applied", {
    filter_type: "category",
    value: slug || "",
    nav_source: navSource,
    ...(slug ? { category_slug: slug } : {}),
    ...(chipMode ? { chip_mode: chipMode } : {}),
  });
}
