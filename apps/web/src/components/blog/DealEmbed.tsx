import * as Sentry from "@sentry/nextjs";
import { fetchCategoryTree, fetchDeals } from "@/api";
import { BlogDealRail } from "@/components/blog/BlogDealRail";
import {
  formatDealEmbedCap,
  parseDealEmbedMaxPrice,
  parseDealEmbedSort,
  withDealEmbedQuery,
} from "@/lib/blogDealEmbed";
import { buildDealsCategoryPath } from "@/lib/dealsCategoryPath";

const DEFAULT_LIMIT = 4;
const DEFAULT_SORT = "value";

type Props = {
  /** Category tree slug, e.g. `gear-helmets`. */
  categorySlug: string;
  title: string;
  /** Override the “see all” path (defaults to `/deals/c/...`). */
  href?: string;
  q?: string;
  limit?: number;
  seeAllLabel?: string;
  /**
   * `GET /deals` sort. Beginner posts should pass `price_asc`.
   * Default `value` (biggest dollar savings) is fine for general rails.
   */
  sort?: string;
  /** Inclusive current-price cap. MDX may pass a string attribute. */
  maxPrice?: number | string;
};

/** Live Dropper deals for a category — used from MDX. */
export async function DealEmbed({
  categorySlug,
  title,
  href,
  q,
  limit = DEFAULT_LIMIT,
  seeAllLabel = "See all deals →",
  sort,
  maxPrice,
}: Props) {
  const slug = categorySlug.trim();
  const resolvedSort = parseDealEmbedSort(sort) ?? DEFAULT_SORT;
  const cap = parseDealEmbedMaxPrice(maxPrice);
  const qTrimmed = q?.trim() || undefined;
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
      q: qTrimmed,
      sort: resolvedSort,
      max_price: cap,
      limit,
      offset: 0,
    });
    deals = res.deals ?? [];
  } catch (error) {
    Sentry.captureException(error);
  }

  seeAllHref = withDealEmbedQuery(seeAllHref, {
    sort: parseDealEmbedSort(sort),
    maxPrice: cap,
    q: qTrimmed,
  });

  const emptyHint =
    cap != null
      ? `Nothing in this category under ${formatDealEmbedCap(cap)} right now — check the full sale or raise the cap.`
      : undefined;

  return (
    <BlogDealRail
      title={title}
      deals={deals}
      seeAllHref={seeAllHref}
      seeAllLabel={seeAllLabel}
      emptyHint={emptyHint}
    />
  );
}
