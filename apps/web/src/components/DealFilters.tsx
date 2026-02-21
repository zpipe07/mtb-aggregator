import type { Store } from "../api";
import { FilterSelect } from "./FilterSelect";
import { FilterInput } from "./FilterInput";

export type SortOption = "newest" | "discount" | "price_asc" | "price_desc";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "discount", label: "Highest discount" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

type DealFiltersProps = {
  stores: Store[];
  brands: string[];
  categories: string[];
  storeFilter: string;
  brandFilter: string;
  categoryFilter: string;
  minDiscount: string;
  sort: SortOption;
  onStoreChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onMinDiscountChange: (value: string) => void;
  onSortChange: (value: SortOption) => void;
};

export function DealFilters({
  stores,
  brands,
  categories,
  storeFilter,
  brandFilter,
  categoryFilter,
  minDiscount,
  sort,
  onStoreChange,
  onBrandChange,
  onCategoryChange,
  onMinDiscountChange,
  onSortChange,
}: DealFiltersProps) {
  const storeOptions = [
    { value: "", label: "All stores" },
    ...stores.map((s) => ({ value: s.name, label: `${s.name} (${s.deal_count})` })),
  ];

  const brandOptions = [
    { value: "", label: "All brands" },
    ...brands.map((b) => ({ value: b, label: b })),
  ];

  const categoryOptions = [
    { value: "", label: "All categories" },
    ...categories.map((c) => ({ value: c, label: c })),
  ];

  return (
    <div className="flex flex-wrap gap-4 mb-6">
      <FilterSelect
        label="Store"
        value={storeFilter}
        onChange={onStoreChange}
        options={storeOptions}
      />
      <FilterSelect
        label="Brand"
        value={brandFilter}
        onChange={onBrandChange}
        options={brandOptions}
      />
      <FilterSelect
        label="Category"
        value={categoryFilter}
        onChange={onCategoryChange}
        options={categoryOptions}
      />
      <FilterInput
        label="Min discount %"
        value={minDiscount}
        onChange={onMinDiscountChange}
        placeholder="e.g. 20"
        min={0}
        max={100}
      />
      <FilterSelect
        label="Sort by"
        value={sort}
        onChange={onSortChange}
        options={SORT_OPTIONS}
      />
    </div>
  );
}
