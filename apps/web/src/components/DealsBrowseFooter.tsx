"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CategoryTreeNode } from "@/api";
import { categoryHasDeals } from "@/lib/categoryTree";
import { buildDealsBrowseHref } from "@/lib/dealsBrowseHref";
import { cn, focusRing } from "@/lib/utils";

type Props = {
  /** Top-level categories only (e.g. from `categoryTree` roots). */
  rootCategories: CategoryTreeNode[];
  /** Full tree for correct `/deals/c/...` paths when slugs contain hyphens. */
  categoryTree: CategoryTreeNode[];
};

export function DealsBrowseFooterInner({
  rootCategories,
  categoryTree,
  searchParams,
}: Props & { searchParams: URLSearchParams }) {
  const roots = rootCategories.filter((n) => categoryHasDeals(n));
  if (roots.length === 0) return null;

  const sorted = [...roots].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <nav
      aria-label="Browse top categories"
      className="mt-10 border-t border-foreground/15 pt-6"
    >
      <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {"// browse by department"}
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {sorted.map((node) => (
          <li key={node.slug}>
            <Link
              href={buildDealsBrowseHref(node.slug, searchParams, categoryTree)}
              className={cn(
                "rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
                focusRing,
              )}
            >
              {node.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Crawlable cross-links to top-level category routes; complements in-card chips.
 */
export function DealsBrowseFooter({ rootCategories, categoryTree }: Props) {
  const searchParams = useSearchParams();
  return (
    <DealsBrowseFooterInner
      rootCategories={rootCategories}
      categoryTree={categoryTree}
      searchParams={searchParams}
    />
  );
}
