"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import type { CategoryTreeNode } from "../api";
import {
  categoryHasDeals,
  findCategoryWithAncestors,
  getBrowseChipNodes,
} from "../lib/categoryTree";
import { buildDealsBrowseHref } from "@/lib/dealsBrowseHref";
import { Button, buttonVariants } from "./ui/button";
import { cn } from "@/lib/utils";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

export type CategoryNavSource = "breadcrumb" | "chip" | "all_clear";

function captureCategoryNav(slug: string, navSource: CategoryNavSource) {
  posthog.capture("filter_applied", {
    filter_type: "category",
    value: slug || "",
    nav_source: navSource,
    ...(slug ? { category_slug: slug } : {}),
  });
}

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

  const resolved = categoryFilter
    ? findCategoryWithAncestors(categoryTree, categoryFilter)
    : null;
  const { nodes: chipsRaw, mode: chipMode } = getBrowseChipNodes(
    categoryTree,
    categoryFilter,
  );
  const chips = chipsRaw.filter((n) => categoryHasDeals(n));
  const chipSectionLabel =
    chipMode === "roots"
      ? "Browse by type"
      : chipMode === "children"
        ? "Subcategories"
        : "Related categories";

  return (
    <DealsCategoryNavPresentation
      categoryTree={categoryTree}
      categoryFilter={categoryFilter}
      resolved={resolved}
      chips={chips}
      chipSectionLabel={chipSectionLabel}
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
  chips: CategoryTreeNode[];
  chipSectionLabel: string;
  searchParams: URLSearchParams;
};

function DealsCategoryNavPresentation({
  categoryTree,
  categoryFilter,
  resolved,
  chips,
  chipSectionLabel,
  searchParams,
}: PresentationProps) {
  return (
    <nav aria-label="Category" className="mb-4 space-y-4 border-b border-foreground/15 pb-4">
      <div>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <span className={cn(monoMicro, "text-muted-foreground")}>
            {"// category"}
          </span>
          <span
            className="mb-0.5 hidden h-px min-w-6 flex-1 max-w-[12rem] bg-border sm:block"
            aria-hidden
          />
        </div>
        {!categoryFilter ? (
          <p className="flex min-h-9 items-center text-sm font-medium text-foreground">
            All deals
          </p>
        ) : (
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
        )}
      </div>

      {chips.length > 0 && (
        <div className="space-y-3 border-t border-foreground/15 pt-4">
          <p className={cn(monoMicro, "text-muted-foreground")}>
            {chipSectionLabel}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {chips.map((node) => {
              const selected = node.slug === categoryFilter;
              const href = buildDealsBrowseHref(
                node.slug,
                searchParams,
                categoryTree,
              );
              if (selected) {
                return (
                  <span
                    key={node.slug}
                    className={cn(
                      buttonVariants({
                        variant: "default",
                        size: "lg",
                      }),
                      "shrink-0 rounded-sm justify-center pointer-events-none opacity-100",
                    )}
                    aria-current="page"
                  >
                    {node.name}
                  </span>
                );
              }
              return (
                <Button key={node.slug} variant="outline" asChild size="lg">
                  <Link
                    href={href}
                    onClick={() => captureCategoryNav(node.slug, "chip")}
                    className="shrink-0 rounded-sm"
                  >
                    {node.name}
                  </Link>
                </Button>
              );
            })}
          </div>
        </div>
      )}
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
