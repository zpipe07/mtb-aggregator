"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CategoryTreeNode } from "../api";
import {
  categoryHasDeals,
  categoryNavDealCount,
  findCategoryWithAncestors,
} from "../lib/categoryTree";
import { captureCategoryNav } from "../lib/categoryNavAnalytics";
import { buildDealsBrowseHref } from "@/lib/dealsBrowseHref";
import { Button } from "./ui/button";
import { cn, focusRing } from "@/lib/utils";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

const MAX_BROWSE_CHIPS = 8;

export type { CategoryNavSource } from "@/lib/categoryNavAnalytics";

type DealsCategoryNavProps = {
  categoryTree: CategoryTreeNode[];
  categoryFilter: string;
};

/** For Storybook/tests: pass `searchParams` explicitly. App uses {@link DealsCategoryNav}. */
export function DealsCategoryNavInner({
  categoryTree,
  categoryFilter,
  searchParams,
}: DealsCategoryNavProps & {
  searchParams: URLSearchParams;
}) {
  if (!categoryTree.length) return null;

  if (!categoryFilter) {
    return (
      <DealsCategoryBrowseChips
        categoryTree={categoryTree}
        searchParams={searchParams}
      />
    );
  }

  const resolved = findCategoryWithAncestors(categoryTree, categoryFilter);

  return (
    <DealsCategoryNavPresentation
      categoryTree={categoryTree}
      categoryFilter={categoryFilter}
      resolved={resolved}
      searchParams={searchParams}
    />
  );
}

export function DealsCategoryNav(props: DealsCategoryNavProps) {
  const searchParams = useSearchParams();
  return <DealsCategoryNavInner {...props} searchParams={searchParams} />;
}

function DealsCategoryBrowseChips({
  categoryTree,
  searchParams,
}: {
  categoryTree: CategoryTreeNode[];
  searchParams: URLSearchParams;
}) {
  const browseCategories = categoryTree
    .filter((node) => categoryHasDeals(node))
    .slice(0, MAX_BROWSE_CHIPS);

  if (browseCategories.length === 0) return null;

  return (
    <nav
      aria-label="Browse by category"
      className="mb-4 border-b border-foreground/15 pb-4"
    >
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <span className={cn(monoMicro, "text-muted-foreground")}>
          {"// browse by category"}
        </span>
        <span
          className="mb-0.5 hidden h-px min-w-6 flex-1 max-w-[12rem] bg-border sm:block"
          aria-hidden
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {browseCategories.map((node) => {
          const count = categoryNavDealCount(node);
          return (
            <Button key={node.slug} variant="outline" size="sm" asChild>
              <Link
                href={buildDealsBrowseHref(node.slug, searchParams, categoryTree)}
                onClick={() => captureCategoryNav(node.slug, "browse_chips")}
              >
                {node.name}
                {count > 0 ? (
                  <span className="ml-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                    ({count})
                  </span>
                ) : null}
              </Link>
            </Button>
          );
        })}
        <Button variant="outline" size="sm" asChild>
          <Link href="/categories">See all →</Link>
        </Button>
      </div>
    </nav>
  );
}

type PresentationProps = {
  categoryTree: CategoryTreeNode[];
  categoryFilter: string;
  resolved: ReturnType<typeof findCategoryWithAncestors>;
  searchParams: URLSearchParams;
};

const crumbLink = cn(
  "rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
  focusRing,
);

function DealsCategoryNavPresentation({
  categoryTree,
  categoryFilter,
  resolved,
  searchParams,
}: PresentationProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 border-b border-foreground/15 pb-3"
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <li>
          <Link
            href={buildDealsBrowseHref("", searchParams, categoryTree)}
            onClick={() => captureCategoryNav("", "all_clear")}
            className={crumbLink}
          >
            All deals
          </Link>
        </li>
        {resolved ? (
          <>
            {resolved.ancestors.map((node) => (
              <li key={node.slug} className="flex items-center gap-2">
                <BreadcrumbSep />
                <Link
                  href={buildDealsBrowseHref(
                    node.slug,
                    searchParams,
                    categoryTree,
                  )}
                  onClick={() => captureCategoryNav(node.slug, "breadcrumb")}
                  className={crumbLink}
                >
                  {node.name}
                </Link>
              </li>
            ))}
            <li className="flex items-center gap-2">
              <BreadcrumbSep />
              <span className="font-medium text-foreground" aria-current="page">
                {resolved.node.name}
              </span>
            </li>
          </>
        ) : (
          <li className="flex items-center gap-2">
            <BreadcrumbSep />
            <span className="font-medium text-muted-foreground" aria-current="page">
              {categoryFilter}
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}

function BreadcrumbSep() {
  return (
    <span className="text-muted-foreground select-none" aria-hidden>
      ›
    </span>
  );
}
