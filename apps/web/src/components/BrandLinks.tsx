import Link from "next/link";
import { fetchDeals } from "@/api";
import type { CategoryTreeNode } from "@/api";
import {
  brandMeetsIndexThreshold,
  buildBrandCategoryDealsPath,
  brandToSlug,
} from "@/lib/brandPages";
import { buildDealsCategoryPath } from "@/lib/dealsCategoryPath";
import { categoryHasDeals } from "@/lib/categoryTree";

type BrandCategoryProps = {
  brand: string;
  brandSlug: string;
  categoryTree: CategoryTreeNode[];
  title?: string;
};

async function brandCategoryEligible(
  brand: string,
  categorySlug: string,
): Promise<boolean> {
  const res = await fetchDeals({
    brands: [brand],
    category_slug: categorySlug,
    limit: 1,
    offset: 0,
    group_variants: true,
  });
  return brandMeetsIndexThreshold(res.total_count ?? 0);
}

function collectCategoriesWithDeals(
  nodes: CategoryTreeNode[],
  out: CategoryTreeNode[] = [],
): CategoryTreeNode[] {
  for (const n of nodes) {
    if (categoryHasDeals(n)) out.push(n);
    if (n.children?.length) collectCategoriesWithDeals(n.children, out);
  }
  return out;
}

/** Links from a brand page to brand+category intersections with inventory. */
export async function BrandCategoryLinks({
  brand,
  brandSlug,
  categoryTree,
  title = "Shop by category",
}: BrandCategoryProps) {
  const candidates = collectCategoriesWithDeals(categoryTree).slice(0, 24);
  if (candidates.length === 0) return null;

  const checks = await Promise.all(
    candidates.map(async (cat) =>
      (await brandCategoryEligible(brand, cat.slug)) ? cat : null,
    ),
  );
  const eligible = checks.filter((x): x is CategoryTreeNode => x != null);
  if (eligible.length === 0) return null;

  return (
    <section aria-labelledby={`brand-category-links-${brandSlug}`}>
      <h2
        id={`brand-category-links-${brandSlug}`}
        className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
      >
        {title}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {eligible.map((cat) => (
          <li key={cat.slug}>
            <Link
              href={buildBrandCategoryDealsPath(
                brandSlug,
                buildDealsCategoryPath(cat.slug, categoryTree),
              )}
              className="inline-flex rounded-sm border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
            >
              {cat.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

type CategoryBrandProps = {
  categorySlug: string;
  categoryTree: CategoryTreeNode[];
  brandFacets: { value: string; count: number }[];
  title?: string;
};

/** Top brands on a category page → brand+category intersections. */
export function CategoryBrandLinks({
  categorySlug,
  categoryTree,
  brandFacets,
  title = "Popular brands",
}: CategoryBrandProps) {
  const top = (brandFacets ?? [])
    .filter((b) => brandMeetsIndexThreshold(b.count))
    .slice(0, 12);
  if (top.length === 0) return null;

  const categoryPath = buildDealsCategoryPath(categorySlug, categoryTree);

  return (
    <section aria-labelledby={`category-brand-links-${categorySlug}`}>
      <h2
        id={`category-brand-links-${categorySlug}`}
        className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
      >
        {title}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {top.map((b) => (
          <li key={b.value}>
            <Link
              href={buildBrandCategoryDealsPath(
                brandToSlug(b.value),
                categoryPath,
              )}
              className="inline-flex rounded-sm border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
            >
              {b.value}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

type GlobalBrandProps = {
  brandFacets: { value: string; count: number }[];
  title?: string;
};

/** Global brand index links (e.g. /deals). */
export function BrandLinksGlobal({
  brandFacets,
  title = "Shop by brand",
}: GlobalBrandProps) {
  const top = (brandFacets ?? [])
    .filter((b) => brandMeetsIndexThreshold(b.count))
    .sort((a, b) => a.value.localeCompare(b.value))
    .slice(0, 24);
  if (top.length === 0) return null;

  return (
    <section aria-labelledby="brand-links-global">
      <h2
        id="brand-links-global"
        className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
      >
        {title}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {top.map((b) => (
          <li key={b.value}>
            <Link
              href={`/deals/brand/${brandToSlug(b.value)}`}
              className="inline-flex rounded-sm border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
            >
              {b.value}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
