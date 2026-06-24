import Link from "next/link";
import { fetchDeals } from "@/api";
import type { Deal } from "@/api";
import { buildDealDetailHref } from "@/lib/dealsBackHref";

type Props = {
  deal: Deal;
  categorySlug?: string;
  title?: string;
};

/** Related in-stock deals (same brand or category). */
export async function RelatedDeals({
  deal,
  categorySlug,
  title = "Related deals",
}: Props) {
  const params: Parameters<typeof fetchDeals>[0] = {
    limit: 6,
    offset: 0,
    sort: "discount",
    group_variants: true,
  };
  if (deal.brand) {
    params.brands = [deal.brand];
  }
  if (categorySlug) {
    params.category_slug = categorySlug;
  }
  if (!params.brands && !params.category_slug) return null;

  const res = await fetchDeals(params);
  const related = (res.deals ?? []).filter((d) => d.id !== deal.id).slice(0, 5);
  if (related.length === 0) return null;

  return (
    <section aria-labelledby="related-deals" className="mt-10 border-t border-border pt-8">
      <h2
        id="related-deals"
        className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
      >
        {title}
      </h2>
      <ul className="space-y-2">
        {related.map((d) => (
          <li key={d.id}>
            <Link
              href={buildDealDetailHref(d.id)}
              className="text-sm text-foreground underline-offset-4 hover:underline"
            >
              {d.product_name}
              <span className="ml-2 font-mono tabular-nums text-muted-foreground">
                ${d.current_price.toFixed(2)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
