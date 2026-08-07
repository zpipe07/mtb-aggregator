import Link from "next/link";
import {
  listSeoHubs,
  buildSeoHubPublicPath,
  hubEligible,
  type SeoHubDefinition,
} from "@/lib/seoHubs";

type Props = {
  hub: SeoHubDefinition;
};

/** Parent category + sibling price/brand hubs for crawlable context on hub pages. */
export async function SeoHubRelatedLinks({ hub }: Props) {
  const siblingCandidates = listSeoHubs().filter(
    (h) =>
      h.slug !== hub.slug &&
      h.relatedCategorySlugs.some((slug) =>
        hub.relatedCategorySlugs.includes(slug),
      ),
  );

  const siblingChecks = await Promise.all(
    siblingCandidates.map(async (h) => ((await hubEligible(h)) ? h : null)),
  );
  const siblings = siblingChecks.filter(
    (x): x is SeoHubDefinition => x != null,
  );

  const hasParent = Boolean(hub.parentCategoryPath && hub.parentCategoryLabel);
  if (!hasParent && siblings.length === 0) return null;

  return (
    <section aria-labelledby={`seo-hub-related-${hub.slug}`}>
      <h2
        id={`seo-hub-related-${hub.slug}`}
        className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
      >
        Related searches
      </h2>
      <ul className="flex flex-wrap gap-2">
        {hasParent ? (
          <li>
            <Link
              href={hub.parentCategoryPath!}
              className="inline-flex rounded-sm border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
            >
              {hub.parentCategoryLabel}
            </Link>
          </li>
        ) : null}
        {siblings.map((h) => (
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
