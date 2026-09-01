"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { CategoryCard } from "../components/CategoryCard";
import type { CategoryTreeNode } from "../api";
import { categoryNavDealCount } from "../lib/categoryTree";
import { getCategorySeo } from "../lib/categorySeo";
import { buildDealsCategoryPath } from "../lib/dealsCategoryPath";
import { cn, focusRing } from "@/lib/utils";

const monoMicro =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]";

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
  /** Slot at page bottom (e.g. `SeoHubLinksGlobal`). */
  children?: ReactNode;
};

export function CategoriesPageContent({ categoryTree, children }: Props) {
  if (categoryTree.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
        <p className="text-muted-foreground">
          Categories aren&apos;t available right now. Try{" "}
          <Link
            href="/deals"
            className={cn(
              "rounded-sm font-mono text-sm font-semibold text-foreground underline underline-offset-4",
              focusRing,
            )}
          >
            all deals
          </Link>{" "}
          instead.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <header className="mb-10 lg:mb-14">
        <p className={cn(monoMicro, "mb-3 text-muted-foreground")}>
          {"// "}
          browse · taxonomy
        </p>
        <h1 className="text-4xl font-semibold tracking-[-0.02em] text-foreground sm:text-5xl">
          Browse categories
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Explore every department we track—bikes, components, gear, and
          accessories—with counts that match the deals list (one row per
          product, variants grouped). Jump into a category to filter listings.
        </p>
      </header>

      <div className="space-y-14 lg:space-y-16">
        {categoryTree.map((root, rootIndex) => {
          const seo = getCategorySeo(root.slug);
          const rootHref = buildDealsCategoryPath(root.slug, categoryTree);

          return (
            <section
              key={root.slug}
              aria-labelledby={`cat-${root.slug}`}
              className="border-t border-foreground/15 pt-12 first:border-t-0 first:pt-0"
            >
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-4 sm:gap-y-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3 sm:gap-4">
                  <span
                    className={cn(
                      monoMicro,
                      "pb-0.5 text-muted-foreground tabular-nums",
                    )}
                  >
                    {"// "}
                    {String(rootIndex + 1).padStart(2, "0")}
                  </span>
                  <h2
                    id={`cat-${root.slug}`}
                    className="text-2xl font-semibold tracking-[-0.02em] text-foreground"
                  >
                    {root.name}
                  </h2>
                  <span className="mb-0.5 hidden h-px min-w-8 flex-1 bg-border sm:block" />
                  <span
                    className={cn(
                      monoMicro,
                      "pb-0.5 tabular-nums text-muted-foreground sm:ml-auto sm:pb-0",
                    )}
                  >
                    {dealLine(categoryNavDealCount(root))}
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
                  className={cn(
                    "w-fit shrink-0 rounded-sm font-mono text-xs font-semibold tracking-wide text-muted-foreground hover:text-foreground",
                    focusRing,
                  )}
                >
                  All {root.name.toLowerCase()} deals →
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

                    const childProducts = categoryNavDealCount(child);
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
                              const gcProducts = categoryNavDealCount(gc);
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
                                    className={cn(
                                      "inline-flex items-center rounded-sm border border-foreground/45 bg-card px-2.5 py-1 text-sm font-medium text-foreground transition-colors hover:border-foreground hover:bg-muted/70",
                                      focusRing,
                                      gcProducts === 0 && "opacity-60",
                                    )}
                                  >
                                    {gc.name}
                                    <span className="ml-1.5 font-mono text-xs tabular-nums text-muted-foreground">
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

      {children ? (
        <div className="mt-14 space-y-10 border-t border-foreground/15 pt-12">
          {children}
        </div>
      ) : null}
    </div>
  );
}
