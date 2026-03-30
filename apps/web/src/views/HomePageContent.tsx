"use client";

import { useState, FormEvent, useTransition } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import Link from "next/link";
import { SearchBar } from "../components/SearchBar";
import { DealGrid } from "../components/DealGrid";
import { CategoryCard } from "../components/CategoryCard";
import { CategoryTreeNode, type Deal } from "../api";
import { buildDealsCategoryPath } from "../lib/dealsCategoryPath";
import { Button } from "../components/ui/button";

/** Slug-to-image mapping for root category cards. Images in public/. */
const CATEGORY_IMAGES: Record<string, string> = {
  bikes: "/stock-bikes.jpg",
  components: "/stock-components.jpg",
  gear: "/stock-gear.jpg",
  accessories: "/stock-accessories.jpg",
};

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

function buildCategoryCards(categoryTree: CategoryTreeNode[]) {
  if (categoryTree.length === 0) {
    return FALLBACK_CATEGORIES.map(({ path, label }) => ({
      path,
      label,
      imageSrc: CATEGORY_IMAGES[path.split("-")[0]] ?? undefined,
    }));
  }
  return categoryTree.slice(0, 8).map((category) => ({
    path: category.slug,
    label: category.name,
    imageSrc: CATEGORY_IMAGES[category.slug] ?? undefined,
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      {/* Hero */}
      <section className="text-center mb-12 lg:mb-16">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground tracking-tight">
          Dialed-in deals.
        </h1>
        <p className="mt-4 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
          We scanned 50+ shops so you didn&apos;t have to.
        </p>
        <form onSubmit={handleSearchSubmit} className="mt-8 max-w-xl mx-auto">
          <div className="flex flex-col sm:flex-row gap-2">
            <SearchBar
              value={searchValue}
              onChange={setSearchValue}
              placeholder="Search deals…"
            />
            <Button type="submit" disabled={isPending}>
              {isPending ? "Searching…" : "Search"}
            </Button>
          </div>
        </form>
      </section>

      {/* Quick-access category cards */}
      <section className="mb-12 lg:mb-16">
        <h2 className="text-xl font-semibold text-foreground mb-6">
          Shop by category
        </h2>
        <div className="grid grid-cols-1 grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {categoryCards.map(({ path, label, imageSrc }) => (
            <CategoryCard
              key={path}
              label={label}
              to={buildDealsCategoryPath(path)}
              imageSrc={imageSrc}
            />
          ))}
        </div>
      </section>

      {/* Top deals */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <h2 className="text-xl font-semibold text-foreground">
            Top deals of the day
          </h2>
          <Link
            href="/deals?sort=discount"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            View all deals
          </Link>
        </div>
        {topDeals.length > 0 ? (
          <DealGrid
            deals={topDeals}
            getHref={(deal) => `/deals/${deal.id}`}
          />
        ) : (
          <p className="text-muted-foreground py-8">No deals available right now.</p>
        )}
      </section>
    </div>
  );
}
