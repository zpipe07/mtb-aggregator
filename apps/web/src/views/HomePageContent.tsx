"use client";

import { useState, FormEvent, useTransition } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import Link from "next/link";
import { SearchBar, SEARCH_FRAME_MIN_H } from "../components/SearchBar";
import { DealGrid } from "../components/DealGrid";
import { CategoryCard } from "../components/CategoryCard";
import { CategoryTreeNode, type Deal } from "../api";
import { categoryHasDeals } from "../lib/categoryTree";
import { CATEGORY_IMAGES } from "../lib/categoryImages";
import { buildDealsCategoryPath } from "../lib/dealsCategoryPath";
import { Button } from "../components/ui/button";
import { cn, focusRing } from "@/lib/utils";

/** Curated category labels for home page CTAs when API has few/empty categories */
const FALLBACK_CATEGORIES: { path: string; label: string }[] = [
  { path: "bikes-electric", label: "E-Bikes" },
  { path: "bikes-mountain", label: "Mountain Bikes" },
  { path: "gear-shoes", label: "Shoes" },
  { path: "gear-helmets", label: "Helmets" },
  { path: "components-brakes", label: "Brakes" },
  { path: "components-suspension-forks", label: "Forks" },
  { path: "components-wheels-tires", label: "Wheels" },
  { path: "components-drivetrain-pedals", label: "Pedals" },
];

function buildCategoryCards(categoryTree: CategoryTreeNode[]): {
  path: string;
  label: string;
  imageSrc?: string;
  dealCount?: number;
}[] {
  if (categoryTree.length === 0) {
    return FALLBACK_CATEGORIES.map(({ path, label }) => ({
      path,
      label,
      imageSrc: CATEGORY_IMAGES[path.split("-")[0]] ?? undefined,
    }));
  }
  const withDeals = categoryTree.filter((c) => categoryHasDeals(c));
  if (withDeals.length === 0) {
    return FALLBACK_CATEGORIES.map(({ path, label }) => ({
      path,
      label,
      imageSrc: CATEGORY_IMAGES[path.split("-")[0]] ?? undefined,
    }));
  }
  return withDeals.slice(0, 8).map((category) => ({
    path: category.slug,
    label: category.name,
    imageSrc: CATEGORY_IMAGES[category.slug] ?? undefined,
    dealCount: category.deal_count,
  }));
}

type Props = {
  categoryTree: CategoryTreeNode[];
  topDeals: Deal[];
};

export function HomePageContent({ categoryTree, topDeals }: Props) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const categoryCards = buildCategoryCards(categoryTree);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = searchValue.trim();
    if (q) {
      posthog.capture("search_submitted", { query: q });
    }
    startTransition(() => {
      if (q) {
        router.push(`/deals?q=${encodeURIComponent(q)}`);
      } else {
        router.push("/deals");
      }
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      {/* Hero */}
      <section className="mb-12 text-center lg:mb-16">
        <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {"// "}
          {new Date().toLocaleDateString("en-CA")} · LIVE
        </p>
        <div className="inline-block text-left">
          <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.025em] text-foreground md:text-6xl">
            <span className="block">Stop searching.</span>
            <span className="relative inline-block">
              <span className="relative z-10">Start shredding.</span>
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-1 -z-0 h-3 bg-primary opacity-70"
              />
            </span>
          </h1>
        </div>
        <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
          Live deals across 50+ mountain bike shops, scanned on a tight loop. One
          screen. No spreadsheets.
        </p>
        <form
          onSubmit={handleSearchSubmit}
          className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="min-w-0 flex-1">
            <SearchBar
              value={searchValue}
              onChange={setSearchValue}
              placeholder="Search deals…"
            />
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-stretch">
            <Button
              type="submit"
              disabled={isPending}
              className={cn(SEARCH_FRAME_MIN_H, "sm:min-w-[8rem]")}
            >
              {isPending ? "Searching…" : "Search"}
            </Button>
            <Button variant="outline" asChild className={cn(SEARCH_FRAME_MIN_H, "sm:min-w-[8rem]")}>
              <Link href="/deals">View all deals</Link>
            </Button>
          </div>
        </form>
      </section>

      {/* Quick-access category cards */}
      <section className="mb-12 lg:mb-16">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <span className="pb-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {"// 01"}
          </span>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
            Shop by category
          </h2>
          <span className="mb-0.5 h-px min-w-8 flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
          {categoryCards.map(({ path, label, imageSrc, dealCount }) => (
            <CategoryCard
              key={path}
              label={label}
              to={buildDealsCategoryPath(path, categoryTree)}
              imageSrc={imageSrc}
              dealCount={dealCount}
            />
          ))}
        </div>
      </section>

      {/* Top deals */}
      <section>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <span className="pb-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {"// 02"}
            </span>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
              Top deals of the day
            </h2>
            <span className="mb-0.5 hidden h-px min-w-8 max-w-xs flex-1 bg-border sm:block" />
          </div>
          <Link
            href="/deals"
            className={cn(
              "rounded-sm font-mono text-xs font-semibold tracking-wide text-muted-foreground hover:text-foreground",
              focusRing,
            )}
          >
            View all deals →
          </Link>
        </div>
        {topDeals.length > 0 ? (
          <DealGrid deals={topDeals} getHref={(deal) => `/deals/${deal.id}`} />
        ) : (
          <p className="text-muted-foreground py-8">
            No deals available right now.
          </p>
        )}
      </section>
    </div>
  );
}
