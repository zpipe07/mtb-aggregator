"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CategoryTreeNode } from "@/api";
import { buildDealsBrowseHref } from "@/lib/dealsBrowseHref";

type Props = {
  /** Top-level categories only (e.g. from `categoryTree` roots). */
  rootCategories: CategoryTreeNode[];
};

export function DealsBrowseFooterInner({
  rootCategories,
  searchParams,
}: Props & { searchParams: URLSearchParams }) {
  if (rootCategories.length === 0) return null;

  const sorted = [...rootCategories].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <nav
      aria-label="Browse top categories"
      className="mt-10 pt-6 border-t border-border"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Browse by department
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {sorted.map((node) => (
          <li key={node.slug}>
            <Link
              href={buildDealsBrowseHref(node.slug, searchParams)}
              className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
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
export function DealsBrowseFooter({ rootCategories }: Props) {
  const searchParams = useSearchParams();
  return (
    <DealsBrowseFooterInner
      rootCategories={rootCategories}
      searchParams={searchParams}
    />
  );
}
