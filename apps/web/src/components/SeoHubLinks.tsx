import Link from "next/link";
import { fetchDeals } from "@/api";
import {
  listSeoHubs,
  buildSeoHubPublicPath,
  hubEligible,
  type SeoHubDefinition,
} from "@/lib/seoHubs";

type CategoryProps = { categorySlug: string; title?: string };

/** Curated buyer-intent hubs linked from a category deals page. */
export async function SeoHubLinksForCategory({
  categorySlug,
  title = "Popular searches",
}: CategoryProps) {
  const candidates = listSeoHubs().filter((h) =>
    h.relatedCategorySlugs.includes(categorySlug),
  );
  if (candidates.length === 0) return null;

  const checks = await Promise.all(
    candidates.map(async (h) => ((await hubEligible(h)) ? h : null)),
  );
  const hubs = checks.filter((x): x is SeoHubDefinition => x != null);
  if (hubs.length === 0) return null;

  return (
    <section
      aria-labelledby={`seo-hub-links-${categorySlug}`}
    >
      <h2
        id={`seo-hub-links-${categorySlug}`}
        className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
      >
        {title}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {hubs.map((h) => (
          <li key={h.slug}>
            <Link
              href={buildSeoHubPublicPath(h.slug)}
              className="inline-flex rounded-sm border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
            >
              {h.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

type GlobalProps = { title?: string };

/** All inventory-eligible hubs — e.g. mountain bike categories index. */
export async function SeoHubLinksGlobal({
  title = "Popular deal searches",
}: GlobalProps) {
  const hubs = listSeoHubs();
  const checks = await Promise.all(
    hubs.map(async (h) => ((await hubEligible(h)) ? h : null)),
  );
  const eligible = checks.filter((x): x is SeoHubDefinition => x != null);
  if (eligible.length === 0) return null;

  return (
    <section aria-labelledby="seo-hub-links-global">
      <h2
        id="seo-hub-links-global"
        className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
      >
        {title}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {eligible.map((h) => (
          <li key={h.slug}>
            <Link
              href={buildSeoHubPublicPath(h.slug)}
              className="inline-flex rounded-sm border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
            >
              {h.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
