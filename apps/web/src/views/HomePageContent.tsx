"use client";

import { useState, FormEvent, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import Link from "next/link";
import { SearchBar, SEARCH_FRAME_MIN_H } from "../components/SearchBar";
import { DealCarousel } from "../components/DealCarousel";
import { CategoryCard } from "../components/CategoryCard";
import { StatTicker } from "../components/StatTicker";
import { CategoryTreeNode } from "../api";
import { categoryHasDeals, categoryNavDealCount } from "../lib/categoryTree";
import { CATEGORY_IMAGES } from "../lib/categoryImages";
import { buildDealsCategoryPath } from "../lib/dealsCategoryPath";
import type { Deal } from "../api";
import type { HomeDealSection } from "../lib/homeDealSections";
import {
  HOME_PRICE_DROPS_SECTION_ID,
  HOME_PRICE_DROPS_VIEW_ALL_HREF,
  HOME_PRICE_DROPS_VIEW_ALL_LABEL,
} from "../lib/homeDealSections";
import { captureHomeViewAllClicked } from "../lib/homeViewAllAnalytics";
import { Button } from "../components/ui/button";
import { cn, focusRing } from "@/lib/utils";
import type { Giveaway } from "@/api";
import { HomeGiveawaysStrip } from "@/components/HomeGiveawaysStrip";
import { deriveGiveawayStatus } from "@/lib/giveawayStatus";

function HomeSectionViewAllLink({
  href,
  homeSection,
}: {
  href: string;
  homeSection: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-sm font-mono text-xs font-semibold tracking-wide text-muted-foreground hover:text-foreground",
        focusRing,
      )}
      onClick={() =>
        captureHomeViewAllClicked({
          navSource: "section_header",
          homeSection,
          href,
        })
      }
    >
      View all →
    </Link>
  );
}
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
    dealCount: categoryNavDealCount(category),
  }));
}

type Props = {
  categoryTree: CategoryTreeNode[];
  priceDropDeals: Deal[];
  dealSections: HomeDealSection[];
  storeCount: number;
  dealCount: number;
  lastUpdated: string;
  openGiveaways?: Giveaway[];
  /** Server-rendered curated hub links for crawl discovery. */
  hubLinks?: ReactNode;
};

export function HomePageContent({
  categoryTree,
  priceDropDeals,
  dealSections,
  storeCount,
  dealCount,
  lastUpdated,
  openGiveaways = [],
  hubLinks,
}: Props) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const categoryCards = buildCategoryCards(categoryTree);
  const visibleDealSections = dealSections.filter(
    (section) => section.deals.length > 0,
  );
  const showPriceDrops = priceDropDeals.length > 0;
  const showOpenGiveaways = openGiveaways.some(
    (g) => deriveGiveawayStatus(g) === "open",
  );
  const dealDetailHref = (dealId: number) => `/deals/${dealId}`;
  let sectionSeq = 1;
  const priceDropsNumber = showPriceDrops
    ? String(sectionSeq++).padStart(2, "0")
    : "01";
  const categoryNumber = String(sectionSeq++).padStart(2, "0");
  const dealsStartNumber = sectionSeq;
  const dealsSectionCount =
    visibleDealSections.length > 0 ? visibleDealSections.length : 1;
  const openEntriesNumber = String(
    dealsStartNumber + dealsSectionCount,
  ).padStart(2, "0");

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
    <>
      <StatTicker
        storeCount={storeCount}
        dealCount={dealCount}
        lastUpdated={lastUpdated}
        variant="inverted"
        fullBleed
      />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        {/* Hero */}
        <section className="mb-12 text-center lg:mb-16">
          <div className="inline-block text-left">
            <h1 className="text-5xl font-semibold leading-[0.95] tracking-[-0.025em] text-foreground md:text-6xl">
              <span className="block">Every MTB sale.</span>
              <span className="relative inline-block">
                <span className="relative z-10">One feed.</span>
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-1 -z-0 h-3 bg-primary opacity-70"
                />
              </span>
            </h1>
          </div>
          <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
            We scan the sale pages from top MTB retailers so you&apos;re not
            bouncing between sites.
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

      {showPriceDrops ? (
        <section className="mb-12 lg:mb-16">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <span className="pb-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {`// ${priceDropsNumber}`}
              </span>
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
                Recent price drops
              </h2>
              <span className="mb-0.5 hidden h-px min-w-8 max-w-xs flex-1 bg-border sm:block" />
            </div>
            <HomeSectionViewAllLink
              href={HOME_PRICE_DROPS_VIEW_ALL_HREF}
              homeSection={HOME_PRICE_DROPS_SECTION_ID}
            />
          </div>
          <DealCarousel
            deals={priceDropDeals}
            getHref={(deal) => dealDetailHref(deal.id)}
            homeSection={HOME_PRICE_DROPS_SECTION_ID}
            viewAll={{
              href: HOME_PRICE_DROPS_VIEW_ALL_HREF,
              label: HOME_PRICE_DROPS_VIEW_ALL_LABEL,
            }}
            ariaLabel="Recent price drops"
          />
        </section>
      ) : null}

      {/* Quick-access category cards */}
      <section className="mb-12 lg:mb-16">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <span className="pb-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {`// ${categoryNumber}`}
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

      {/* Top deals by category */}
      {visibleDealSections.length > 0 ? (
        <div className="space-y-10 lg:space-y-12">
          {visibleDealSections.map((section, index) => {
            const viewAllHref = buildDealsCategoryPath(
              section.categorySlug,
              categoryTree,
            );
            return (
              <section key={section.id}>
                <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                  <div className="flex flex-wrap items-end gap-4">
                    <span className="pb-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {`// ${String(index + dealsStartNumber).padStart(2, "0")}`}
                    </span>
                    <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
                      {section.title}
                    </h2>
                    <span className="mb-0.5 hidden h-px min-w-8 max-w-xs flex-1 bg-border sm:block" />
                  </div>
                  <HomeSectionViewAllLink
                    href={viewAllHref}
                    homeSection={section.id}
                  />
                </div>
                <DealCarousel
                  deals={section.deals}
                  getHref={(deal) => dealDetailHref(deal.id)}
                  homeSection={section.id}
                  viewAll={{
                    href: viewAllHref,
                    label: section.viewAllLabel,
                  }}
                  ariaLabel={section.title}
                />
              </section>
            );
          })}
        </div>
      ) : (
        <section>
          <div className="mb-6 flex flex-wrap items-end gap-4">
            <span className="pb-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {`// ${String(dealsStartNumber).padStart(2, "0")}`}
            </span>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
              Top deals of the day
            </h2>
          </div>
          <p className="py-8 text-muted-foreground">
            No deals available right now.
          </p>
        </section>
      )}

      {showOpenGiveaways ? (
        <HomeGiveawaysStrip
          giveaways={openGiveaways}
          sectionNumber={openEntriesNumber}
        />
      ) : null}

      {hubLinks ? (
        <section className="mt-12 border-t border-foreground/15 pt-10 lg:mt-16">
          {hubLinks}
        </section>
      ) : null}
      </div>
    </>
  );
}
