import { useEffect, useCallback, useTransition } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import type { CategoryTreeNode } from "../api";
import {
  parseFilterParamsFromURL,
  type SortOption,
} from "../lib/filterParams";
import {
  buildDealsCategoryPath,
  parseCategorySlugFromDealsPath,
} from "../lib/dealsCategoryPath";

export type { SortOption };

const SPEC_PREFIX = "spec_";
const VARIANT_PREFIX = "variant_";

function applyToParams(
  prev: URLSearchParams,
  updates: Partial<{
    searchQuery: string;
    storeFilter: string;
    brandFilters: string[];
    categoryFilter: string;
    minDiscount: string;
    minPrice: string;
    excludeCategorySlug: string;
    specFilters: Record<string, string[]>;
    variantFilters: Record<string, string[]>;
    sort: SortOption;
    offset: number;
  }>,
): URLSearchParams {
  const next = new URLSearchParams(prev);

  const set = (key: string, value: string) => {
    if (value === "" || value === "0") next.delete(key);
    else next.set(key, value);
  };

  if (updates.searchQuery !== undefined) set("q", updates.searchQuery);
  if (updates.storeFilter !== undefined) set("store", updates.storeFilter);
  if (updates.brandFilters !== undefined) {
    next.delete("brand");
    for (const b of updates.brandFilters) {
      const t = b.trim();
      if (t) next.append("brand", t);
    }
  }
  if (updates.categoryFilter !== undefined) set("category", updates.categoryFilter);
  if (updates.minDiscount !== undefined) set("min_discount", updates.minDiscount);
  if (updates.minPrice !== undefined) set("min_price", updates.minPrice);
  if (updates.excludeCategorySlug !== undefined)
    set("exclude_category_slug", updates.excludeCategorySlug);
  if (updates.sort !== undefined) set("sort", updates.sort === "discount" ? "" : updates.sort);
  if (updates.offset !== undefined) set("offset", updates.offset === 0 ? "" : String(updates.offset));

  if (updates.specFilters !== undefined) {
    Array.from(next.keys()).forEach((key) => {
      if (key.startsWith(SPEC_PREFIX)) next.delete(key);
    });
    Object.entries(updates.specFilters).forEach(([k, vals]) => {
      for (const v of vals) {
        const t = v.trim();
        if (t) next.append(`${SPEC_PREFIX}${k}`, t);
      }
    });
  }

  if (updates.variantFilters !== undefined) {
    Array.from(next.keys()).forEach((key) => {
      if (key.startsWith(VARIANT_PREFIX)) next.delete(key);
    });
    Object.entries(updates.variantFilters).forEach(([k, vals]) => {
      for (const v of vals) {
        const t = v.trim();
        if (t) next.append(`${VARIANT_PREFIX}${k}`, t);
      }
    });
  }

  return next;
}

export function useFilterParams(options?: {
  categoryTree?: CategoryTreeNode[] | null;
}) {
  const categoryTree = options?.categoryTree;
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const base = parseFilterParamsFromURL(searchParams);
  const categoryFromPath = parseCategorySlugFromDealsPath(pathname);
  const state = {
    ...base,
    categoryFilter: categoryFromPath ?? base.categoryFilter,
  };

  const updateParams = useCallback(
    (
      updates: Partial<{
        searchQuery: string;
        storeFilter: string;
        brandFilters: string[];
        categoryFilter: string;
        minDiscount: string;
        minPrice: string;
        excludeCategorySlug: string;
        specFilters: Record<string, string[]>;
        variantFilters: Record<string, string[]>;
        sort: SortOption;
        offset: number;
      }>,
    ) => {
      const next = applyToParams(
        new URLSearchParams(searchParams.toString()),
        updates,
      );
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [searchParams, pathname, router],
  );

  const setSearchQuery = useCallback(
    (v: string) => updateParams({ searchQuery: v, offset: 0 }),
    [updateParams],
  );
  const setStoreFilter = useCallback(
    (v: string) => updateParams({ storeFilter: v, offset: 0 }),
    [updateParams],
  );
  const toggleBrandFilter = useCallback(
    (value: string) => {
      const v = value.trim();
      if (!v) return;
      const cur = state.brandFilters;
      const idx = cur.indexOf(v);
      const nextBrands = idx >= 0 ? cur.filter((x) => x !== v) : [...cur, v];
      updateParams({ brandFilters: nextBrands, offset: 0 });
    },
    [updateParams, state.brandFilters],
  );
  const clearBrandFilters = useCallback(
    () => updateParams({ brandFilters: [], offset: 0 }),
    [updateParams],
  );
  const setCategoryFilter = useCallback(
    (v: string) => {
      const raw = new URLSearchParams(searchParams.toString());
      raw.delete("category");
      const next = applyToParams(raw, {
        categoryFilter: "",
        specFilters: {},
        variantFilters: {},
        offset: 0,
      });
      const qs = next.toString();
      const path = v ? buildDealsCategoryPath(v, categoryTree) : "/deals";
      startTransition(() => {
        router.replace(qs ? `${path}?${qs}` : path);
      });
    },
    [searchParams, router, categoryTree],
  );
  const setMinDiscount = useCallback(
    (v: string) => updateParams({ minDiscount: v, offset: 0 }),
    [updateParams],
  );
  const toggleSpecFilter = useCallback(
    (key: string, value: string) => {
      const v = value.trim();
      if (!v) return;
      const cur = state.specFilters[key] ?? [];
      const idx = cur.indexOf(v);
      const nextVals = idx >= 0 ? cur.filter((x) => x !== v) : [...cur, v];
      const next = { ...state.specFilters };
      if (nextVals.length === 0) delete next[key];
      else next[key] = nextVals;
      updateParams({ specFilters: next, offset: 0 });
    },
    [updateParams, state.specFilters],
  );
  const clearSpecFilter = useCallback(
    (key: string) => {
      const next = { ...state.specFilters };
      delete next[key];
      updateParams({ specFilters: next, offset: 0 });
    },
    [updateParams, state.specFilters],
  );
  const toggleVariantFilter = useCallback(
    (key: string, value: string) => {
      const v = value.trim();
      if (!v) return;
      const cur = state.variantFilters[key] ?? [];
      const idx = cur.indexOf(v);
      const nextVals = idx >= 0 ? cur.filter((x) => x !== v) : [...cur, v];
      const next = { ...state.variantFilters };
      if (nextVals.length === 0) delete next[key];
      else next[key] = nextVals;
      updateParams({ variantFilters: next, offset: 0 });
    },
    [updateParams, state.variantFilters],
  );
  const clearVariantFilter = useCallback(
    (key: string) => {
      const next = { ...state.variantFilters };
      delete next[key];
      updateParams({ variantFilters: next, offset: 0 });
    },
    [updateParams, state.variantFilters],
  );
  const setSort = useCallback(
    (v: SortOption) => updateParams({ sort: v, offset: 0 }),
    [updateParams],
  );
  const setOffset = useCallback(
    (v: number) => updateParams({ offset: v }),
    [updateParams],
  );

  const clearAllFilters = useCallback(() => {
    updateParams({
      searchQuery: "",
      storeFilter: "",
      brandFilters: [],
      categoryFilter: "",
      minDiscount: "",
      minPrice: "",
      excludeCategorySlug: "",
      specFilters: {},
      variantFilters: {},
      offset: 0,
    });
  }, [updateParams]);

  // When search clears but URL has sort=relevance, sync URL to default sort
  useEffect(() => {
    const rawSort = searchParams.get("sort");
    if (base.searchQuery.trim() === "" && rawSort === "relevance") {
      updateParams({ sort: "discount" });
    }
  }, [base.searchQuery, searchParams, updateParams]);

  return {
    ...state,
    isPending,
    setSearchQuery,
    setStoreFilter,
    toggleBrandFilter,
    clearBrandFilters,
    setCategoryFilter,
    setMinDiscount,
    toggleSpecFilter,
    clearSpecFilter,
    toggleVariantFilter,
    clearVariantFilter,
    setSort,
    setOffset,
    clearAllFilters,
  };
}
