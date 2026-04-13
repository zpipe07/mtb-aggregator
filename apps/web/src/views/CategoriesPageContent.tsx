"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { CategoryCard } from "../components/CategoryCard";
import type { CategoryTreeNode } from "../api";
import { getCategorySeo } from "../lib/categorySeo";
import { buildDealsCategoryPath } from "../lib/dealsCategoryPath";

/** Grouped product count (matches deals list); falls back to listing rollup if API is old. */
function productDealCount(node: CategoryTreeNode): number {
  return node.product_count ?? node.deal_count;
}

function dealLine(count: number): string {
  if (count === 0) return "No deals right now";
  return `${count} deal${count === 1 ? "" : "s"}`;
}

function MutedWrap({
  muted,
  children,
}: {
  muted: boolean;
  children: ReactNode;
}) {
  return (
    <div className={muted ? "opacity-60" : undefined}>{children}</div>
  );
}

type Props = {
  categoryTree: CategoryTreeNode[];
};

export function CategoriesPageContent({ categoryTree }: Props) {
  if (categoryTree.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
        <p className="text-muted-foreground">
          Categories aren&apos;t available right now. Try{" "}
          <Link href="/deals" className="text-primary underline underline-offset-4">
            all deals
          </Link>{" "}
          instead.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <header className="mb-10 lg:mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
          Browse categories
        </h1>
        <p className="mt-3 text-lg text-muted-foreground max-w-2xl">
          Explore every department we track—bikes, components, gear, and
          accessories—with counts that match the deals list (one row per
          product, variants grouped). Jump into a category to filter listings.
        </p>
      </header>

      <div className="space-y-12 lg:space-y-14">
        {categoryTree.map((root) => {
          const seo = getCategorySeo(root.slug);
          const rootHref = buildDealsCategoryPath(root.slug, categoryTree);

          return (
            <section
              key={root.slug}
              aria-labelledby={`cat-${root.slug}`}
              className="border-t border-border pt-10 first:border-t-0 first:pt-0"
            >
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-1">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2
                    id={`cat-${root.slug}`}
                    className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                  >
                    {root.name}
                  </h2>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground sm:text-sm">
                    {dealLine(productDealCount(root))}
                  </span>
                </div>
                <Link
                  href={rootHref}
                  onClick={() =>
                    posthog.capture("category_clicked", {
                      category: root.name,
                      href: rootHref,
                    })
                  }
                  className="text-sm font-medium text-primary hover:underline underline-offset-4 w-fit"
                >
                  All {root.name.toLowerCase()} deals
                  <span aria-hidden className="ml-0.5">
                    →
                  </span>
                </Link>
              </div>
              {seo.intro ? (
                <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {seo.intro}
                </p>
              ) : null}

              {root.children.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
                  {root.children.map((child) => {
                    const childHref = buildDealsCategoryPath(
                      child.slug,
                      categoryTree,
                    );
                    const hasGrandchildren =
                      (child.children?.length ?? 0) > 0;

                    const childProducts = productDealCount(child);
                    return (
                      <div key={child.slug} className="space-y-3">
                        <MutedWrap muted={childProducts === 0}>
                          <CategoryCard
                            label={child.name}
                            to={childHref}
                            description={
                              hasGrandchildren
                                ? `${dealLine(childProducts)} · Subtypes below`
                                : dealLine(childProducts)
                            }
                          />
                        </MutedWrap>
                        {hasGrandchildren ? (
                          <ul className="flex flex-wrap gap-2 pl-0 list-none">
                            {child.children.map((gc) => {
                              const gcProducts = productDealCount(gc);
                              return (
                                <li key={gc.slug}>
                                  <Link
                                    href={buildDealsCategoryPath(
                                      gc.slug,
                                      categoryTree,
                                    )}
                                    onClick={() =>
                                      posthog.capture("category_clicked", {
                                        category: gc.name,
                                        href: buildDealsCategoryPath(
                                          gc.slug,
                                          categoryTree,
                                        ),
                                      })
                                    }
                                    className={`inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted ${
                                      gcProducts === 0 ? "opacity-60" : ""
                                    }`}
                                  >
                                    {gc.name}
                                    <span className="ml-1.5 text-muted-foreground tabular-nums">
                                      ({gcProducts})
                                    </span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
