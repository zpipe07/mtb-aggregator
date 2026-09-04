import * as Sentry from "@sentry/nextjs";
import { fetchCategoryTree, fetchDeals } from "@/api";
import { BlogDealRail } from "@/components/blog/BlogDealRail";
import { buildDealsCategoryPath } from "@/lib/dealsCategoryPath";

const DEFAULT_LIMIT = 4;

type Props = {
  /** Category tree slug, e.g. `gear-helmets`. */
  categorySlug: string;
  title: string;
  /** Override the “see all” path (defaults to `/deals/c/...`). */
  href?: string;
  q?: string;
  limit?: number;
  seeAllLabel?: string;
};

/** Live Dropper deals for a category — used from MDX. */
export async function DealEmbed({
  categorySlug,
  title,
  href,
  q,
  limit = DEFAULT_LIMIT,
  seeAllLabel = "See all deals →",
}: Props) {
  const slug = categorySlug.trim();
  // Query form 308s to `/deals/c/...` via middleware when the live tree is unavailable.
  let seeAllHref = href?.trim() || `/deals?category=${encodeURIComponent(slug)}`;
  let deals: Awaited<ReturnType<typeof fetchDeals>>["deals"] = [];

  try {
    const tree = await fetchCategoryTree();
    if (!href?.trim()) {
      seeAllHref = buildDealsCategoryPath(slug, tree);
    }
    const res = await fetchDeals({
      category_slug: slug,
      q: q?.trim() || undefined,
      sort: "value",
      limit,
      offset: 0,
    });
    deals = res.deals ?? [];
  } catch (error) {
    Sentry.captureException(error);
  }

  return (
    <BlogDealRail
      title={title}
      deals={deals}
      seeAllHref={seeAllHref}
      seeAllLabel={seeAllLabel}
    />
  );
}
