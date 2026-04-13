"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { CategoryCard } from "../components/CategoryCard";
import type { CategoryTreeNode } from "../api";
import { CATEGORY_IMAGES } from "../lib/categoryImages";
import { getCategorySeo } from "../lib/categorySeo";
import { buildDealsCategoryPath } from "../lib/dealsCategoryPath";

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
          accessories—with live deal counts. Jump into a category to filter
          listings.
        </p>
      </header>

      <div className="space-y-14 lg:space-y-16">
        {categoryTree.map((root) => {
          const seo = getCategorySeo(root.slug);
          const rootHref = buildDealsCategoryPath(root.slug, categoryTree);
          const rootImage = CATEGORY_IMAGES[root.slug];

          return (
            <section key={root.slug} aria-labelledby={`cat-${root.slug}`}>
              <div className="flex flex-wrap items-baseline gap-3 mb-2">
                <h2
                  id={`cat-${root.slug}`}
                  className="text-2xl font-semibold text-foreground"
                >
                  {root.name}
                </h2>
                <span className="text-sm font-medium rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
                  {dealLine(root.deal_count)}
                </span>
              </div>
              {seo.intro ? (
                <p className="text-muted-foreground mb-6 max-w-3xl">{seo.intro}</p>
              ) : null}

              <div className="mb-8 max-w-md">
                <MutedWrap muted={root.deal_count === 0}>
                  <CategoryCard
                    label={root.name}
                    to={rootHref}
                    imageSrc={rootImage}
                    description={dealLine(root.deal_count)}
                  />
                </MutedWrap>
              </div>

              {root.children.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {root.children.map((child) => {
                    const childHref = buildDealsCategoryPath(
                      child.slug,
                      categoryTree,
                    );
                    const hasGrandchildren =
                      (child.children?.length ?? 0) > 0;

                    return (
                      <div key={child.slug} className="space-y-3">
                        <MutedWrap muted={child.deal_count === 0}>
                          <CategoryCard
                            label={child.name}
                            to={childHref}
                            description={
                              hasGrandchildren
                                ? `${dealLine(child.deal_count)} · Subtypes below`
                                : dealLine(child.deal_count)
                            }
                          />
                        </MutedWrap>
                        {hasGrandchildren ? (
                          <ul className="flex flex-wrap gap-2 pl-0 list-none">
                            {child.children.map((gc) => (
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
                                    gc.deal_count === 0
                                      ? "opacity-60"
                                      : ""
                                  }`}
                                >
                                  {gc.name}
                                  <span className="ml-1.5 text-muted-foreground tabular-nums">
                                    ({gc.deal_count})
                                  </span>
                                </Link>
                              </li>
                            ))}
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
