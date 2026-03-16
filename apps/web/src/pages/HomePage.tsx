import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useCategoryTree, useDeals } from "../hooks/queries";
import { SearchBar } from "../components/SearchBar";
import { DealGrid } from "../components/DealGrid";
import { CategoryCard } from "../components/CategoryCard";
import { LoadingState } from "../components/LoadingState";
import { Link } from "react-router-dom";
import { CategoryTreeNode } from "../api";
import { Button } from "../components/ui/button";

/** Curated category labels for home page CTAs when API has few/empty categories */
const FALLBACK_CATEGORIES: { path: string; label: string }[] = [
  { path: "bikes-electric", label: "E-Bikes" },
  { path: "bikes-mountain", label: "Mountain Bikes" },
  { path: "gear-shoes", label: "Shoes" },
  { path: "gear-helmets", label: "Helmets" },
  { path: "components-brakes", label: "Brakes" },
  { path: "components-suspension-forks", label: "Forks" },
  { path: "components-wheels", label: "Wheels" },
  { path: "components-pedals", label: "Pedals" },
];

function buildCategoryCards(categoryTree: CategoryTreeNode[]) {
  if (categoryTree.length === 0) return FALLBACK_CATEGORIES;
  return categoryTree.slice(0, 8).map((category) => ({
    path: category.slug,
    label: category.name,
  }));
}

export function HomePage() {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");

  const { data: categoryTreeData } = useCategoryTree();
  const categoryTree = categoryTreeData ?? [];
  const categoryCards = buildCategoryCards(categoryTree);

  const { data: topDealsData, isPending: topDealsLoading } = useDeals({
    sort: "discount",
    limit: 8,
    offset: 0,
  });
  const topDeals = topDealsData?.deals ?? [];

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = searchValue.trim();
    if (q) {
      navigate(`/deals?q=${encodeURIComponent(q)}`);
    } else {
      navigate("/deals");
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      {/* Hero */}
      <section className="text-center mb-12 lg:mb-16">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-stone-900 tracking-tight">
          MTB Deal Aggregator
        </h1>
        <p className="mt-4 text-lg sm:text-xl text-stone-600 max-w-2xl mx-auto">
          Find the best mountain bike deals across top retailers
        </p>
        <form onSubmit={handleSearchSubmit} className="mt-8 max-w-xl mx-auto">
          <div className="flex flex-col sm:flex-row gap-2">
            <SearchBar
              value={searchValue}
              onChange={setSearchValue}
              placeholder="Search deals…"
            />
            <Button type="submit">Search</Button>
          </div>
        </form>
      </section>

      {/* Quick-access category cards */}
      <section className="mb-12 lg:mb-16">
        <h2 className="text-xl font-semibold text-stone-900 mb-6">
          Shop by category
        </h2>
        <div className="grid grid-cols-1 grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {categoryCards.map(({ path, label }) => (
            <CategoryCard
              key={path}
              label={label}
              to={`/deals?category=${encodeURIComponent(path)}`}
            />
          ))}
        </div>
      </section>

      {/* Top deals */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <h2 className="text-xl font-semibold text-stone-900">
            Top deals of the day
          </h2>
          <Link
            to="/deals?sort=discount"
            className="text-sm font-medium text-stone-600 hover:text-stone-900"
          >
            View all deals
          </Link>
        </div>
        {topDealsLoading ? (
          <LoadingState />
        ) : topDeals.length > 0 ? (
          <DealGrid
            deals={topDeals}
            onSelectDeal={(deal) =>
              navigate(`/deals?deal=${deal.id}`, { replace: false })
            }
          />
        ) : (
          <p className="text-stone-500 py-8">No deals available right now.</p>
        )}
      </section>
    </div>
  );
}
