"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CategoryTreeNode } from "../api";
import { findCategoryWithAncestors } from "../lib/categoryTree";
import { captureCategoryNav } from "../lib/categoryNavAnalytics";
import { buildDealsBrowseHref } from "@/lib/dealsBrowseHref";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

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
  if (!categoryTree.length || !categoryFilter) return null;

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

type PresentationProps = {
  categoryTree: CategoryTreeNode[];
  categoryFilter: string;
  resolved: ReturnType<typeof findCategoryWithAncestors>;
  searchParams: URLSearchParams;
};

function DealsCategoryNavPresentation({
  categoryTree,
  categoryFilter,
  resolved,
  searchParams,
}: PresentationProps) {
  return (
    <nav
      aria-label="Category"
      className="mb-4 border-b border-foreground/15 pb-4"
    >
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <span className={cn(monoMicro, "text-muted-foreground")}>
          {"// category"}
        </span>
        <span
          className="mb-0.5 hidden h-px min-w-6 flex-1 max-w-[12rem] bg-border sm:block"
          aria-hidden
        />
      </div>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        <li className="flex min-h-9 items-center">
          <Button variant="outline" size="sm" asChild>
            <Link
              href={buildDealsBrowseHref("", searchParams, categoryTree)}
              onClick={() => captureCategoryNav("", "all_clear")}
            >
              All deals
            </Link>
          </Button>
        </li>
        {resolved ? (
          <>
            {resolved.ancestors.map((node) => (
              <li
                key={node.slug}
                className="flex min-h-9 items-center gap-1.5"
              >
                <BreadcrumbSep />
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={buildDealsBrowseHref(
                      node.slug,
                      searchParams,
                      categoryTree,
                    )}
                    onClick={() =>
                      captureCategoryNav(node.slug, "breadcrumb")
                    }
                  >
                    {node.name}
                  </Link>
                </Button>
              </li>
            ))}
            <li className="flex min-h-9 items-center gap-1.5">
              <BreadcrumbSep />
              <span
                className="font-semibold text-foreground"
                aria-current="page"
              >
                {resolved.node.name}
              </span>
            </li>
          </>
        ) : (
          <li className="flex min-h-9 items-center gap-1.5">
            <BreadcrumbSep />
            <span className="font-semibold text-muted-foreground">
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
