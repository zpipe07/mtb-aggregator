"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CategoryTreeNode } from "../api";
import {
  categoryNavDealCount,
  findCategoryWithAncestors,
  selectDealsBrowseChips,
  type DealsBrowseChipRow,
} from "../lib/categoryTree";
import {
  captureCategoryNav,
  type BrowseChipMode,
} from "../lib/categoryNavAnalytics";
import { buildDealsBrowseHref } from "@/lib/dealsBrowseHref";
import { Button, buttonVariants } from "./ui/button";
import { cn, focusRing } from "@/lib/utils";

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
  if (!categoryTree.length) return null;

  const row = selectDealsBrowseChips(categoryTree, categoryFilter);

  if (!categoryFilter) {
    if (!row) return null;
    return (
      <DealsCategoryBrowseChips
        row={row}
        categoryTree={categoryTree}
        searchParams={searchParams}
        framed
      />
    );
  }

  const resolved = findCategoryWithAncestors(categoryTree, categoryFilter);

  return (
    <div
      className={cn(
        "mb-4 border-b border-foreground/15",
        row ? "pb-4" : "pb-3",
      )}
    >
      <DealsCategoryNavPresentation
        categoryTree={categoryTree}
        categoryFilter={categoryFilter}
        resolved={resolved}
        searchParams={searchParams}
        className={row ? "mb-4" : undefined}
      />
      {row ? (
        <DealsCategoryBrowseChips
          row={row}
          categoryTree={categoryTree}
          searchParams={searchParams}
        />
      ) : null}
    </div>
  );
}

export function DealsCategoryNav(props: DealsCategoryNavProps) {
  const searchParams = useSearchParams();
  return <DealsCategoryNavInner {...props} searchParams={searchParams} />;
}

function CategoryChipCount({
  count,
  onInverse = false,
}: {
  count: number;
  onInverse?: boolean;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "ml-1.5 font-mono text-[10px] tabular-nums",
        onInverse
          ? "text-background/70"
          : "text-muted-foreground group-hover/button:text-background/70",
      )}
    >
      ({count})
    </span>
  );
}

function ParentCategoryChip({
  parent,
  categoryTree,
  searchParams,
}: {
  parent: CategoryTreeNode;
  categoryTree: CategoryTreeNode[];
  searchParams: URLSearchParams;
}) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link
        href={buildDealsBrowseHref(parent.slug, searchParams, categoryTree)}
        onClick={() => captureCategoryNav(parent.slug, "browse_chips", "parent")}
      >
        <span className="sr-only">Back to </span>
        <span aria-hidden="true">‹</span>
        {parent.name}
        <CategoryChipCount count={categoryNavDealCount(parent)} />
      </Link>
    </Button>
  );
}

function DealsCategoryBrowseChips({
  row,
  categoryTree,
  searchParams,
  framed = false,
}: {
  row: DealsBrowseChipRow;
  categoryTree: CategoryTreeNode[];
  searchParams: URLSearchParams;
  framed?: boolean;
}) {
  return (
    <nav
      aria-label="Browse by category"
      className={cn(framed && "mb-4 border-b border-foreground/15 pb-4")}
    >
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <span className={cn(monoMicro, "text-muted-foreground")}>{row.label}</span>
        <span
          className="mb-0.5 hidden h-px min-w-6 flex-1 max-w-[12rem] bg-border sm:block"
          aria-hidden
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {row.parent ? (
          <ParentCategoryChip
            parent={row.parent}
            categoryTree={categoryTree}
            searchParams={searchParams}
          />
        ) : null}
        {row.nodes.map((node) => {
          const count = categoryNavDealCount(node);
          const current = node.slug === row.currentSlug;
          if (current) {
            return (
              <span
                key={node.slug}
                aria-current="page"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "bg-foreground text-background hover:bg-foreground hover:text-background",
                )}
              >
                {node.name}
                <CategoryChipCount count={count} onInverse />
              </span>
            );
          }
          const chipMode: BrowseChipMode = row.mode;
          return (
            <Button key={node.slug} variant="outline" size="sm" asChild>
              <Link
                href={buildDealsBrowseHref(node.slug, searchParams, categoryTree)}
                onClick={() =>
                  captureCategoryNav(node.slug, "browse_chips", chipMode)
                }
              >
                {node.name}
                <CategoryChipCount count={count} />
              </Link>
            </Button>
          );
        })}
        {row.showSeeAll ? (
          <Button variant="outline" size="sm" asChild>
            <Link href="/categories">See all →</Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}

type PresentationProps = {
  categoryTree: CategoryTreeNode[];
  categoryFilter: string;
  resolved: ReturnType<typeof findCategoryWithAncestors>;
  searchParams: URLSearchParams;
  className?: string;
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
  className,
}: PresentationProps) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
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
