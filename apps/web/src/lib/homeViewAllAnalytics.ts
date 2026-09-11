import posthog from "posthog-js";

export type HomeViewAllNavSource = "section_header" | "rail_end_card";

/** Homepage "View all" CTA — header link or end-of-rail card. */
export function captureHomeViewAllClicked({
  navSource,
  homeSection,
  href,
}: {
  navSource: HomeViewAllNavSource;
  homeSection?: string;
  href: string;
}) {
  posthog.capture("home_view_all_clicked", {
    nav_source: navSource,
    href,
    ...(homeSection ? { home_section: homeSection } : {}),
  });
}
