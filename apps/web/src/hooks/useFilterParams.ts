import { useEffect, useCallback } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import {
  parseFilterParamsFromURL,
  type SortOption,
} from "../lib/filterParams";

export type { SortOption };

const SPEC_PREFIX = "spec_";
const VARIANT_PREFIX = "variant_";

function applyToParams(
  prev: URLSearchParams,
  updates: Partial<{
    searchQuery: string;
    storeFilter: string;
    brandFilter: string;
    categoryFilter: string;
    minDiscount: string;
    specFilters: Record<string, string>;
    variantFilters: Record<string, string>;
    sort: SortOption;
    offset: number;
  }>
): URLSearchParams {
  const next = new URLSearchParams(prev);

  const set = (key: string, value: string) => {
    if (value === "" || value === "0") next.delete(key);
    else next.set(key, value);
  };

  if (updates.searchQuery !== undefined) set("q", updates.searchQuery);
  if (updates.storeFilter !== undefined) set("store", updates.storeFilter);
  if (updates.brandFilter !== undefined) set("brand", updates.brandFilter);
  if (updates.categoryFilter !== undefined) set("category", updates.categoryFilter);
  if (updates.minDiscount !== undefined) set("min_discount", updates.minDiscount);
  if (updates.sort !== undefined) set("sort", updates.sort === "newest" ? "" : updates.sort);
  if (updates.offset !== undefined) set("offset", updates.offset === 0 ? "" : String(updates.offset));

  if (updates.specFilters !== undefined) {
    // Remove existing spec_ params
    [...next.entries()].forEach(([key]) => {
      if (key.startsWith(SPEC_PREFIX)) next.delete(key);
    });
    Object.entries(updates.specFilters).forEach(([k, v]) => {
      if (v) next.set(`${SPEC_PREFIX}${k}`, v);
    });
  }

  if (updates.variantFilters !== undefined) {
    [...next.entries()].forEach(([key]) => {
      if (key.startsWith(VARIANT_PREFIX)) next.delete(key);
    });
    Object.entries(updates.variantFilters).forEach(([k, v]) => {
      if (v) next.set(`${VARIANT_PREFIX}${k}`, v);
    });
  }

  return next;
}

export function useFilterParams() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const state = parseFilterParamsFromURL(searchParams);

  const updateParams = useCallback(
    (
      updates: Partial<{
        searchQuery: string;
        storeFilter: string;
        brandFilter: string;
        categoryFilter: string;
        minDiscount: string;
        specFilters: Record<string, string>;
        variantFilters: Record<string, string>;
        sort: SortOption;
        offset: number;
      }>
    ) => {
      const next = applyToParams(
        new URLSearchParams(searchParams.toString()),
        updates
      );
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [searchParams, pathname, router]
  );

  const setSearchQuery = useCallback(
    (v: string) => updateParams({ searchQuery: v, offset: 0 }),
    [updateParams]
  );
  const setStoreFilter = useCallback(
    (v: string) => updateParams({ storeFilter: v, offset: 0 }),
    [updateParams]
  );
  const setBrandFilter = useCallback(
    (v: string) => updateParams({ brandFilter: v, offset: 0 }),
    [updateParams]
  );
  const setCategoryFilter = useCallback(
    (v: string) =>
      updateParams({ categoryFilter: v, specFilters: {}, variantFilters: {}, offset: 0 }),
    [updateParams]
  );
  const setMinDiscount = useCallback(
    (v: string) => updateParams({ minDiscount: v, offset: 0 }),
    [updateParams]
  );
  const setSpecFilter = useCallback(
    (key: string, value: string) => {
      const next = { ...state.specFilters };
      if (value === "") delete next[key];
      else next[key] = value;
      updateParams({ specFilters: next, offset: 0 });
    },
    [updateParams, state.specFilters]
  );
  const clearSpecFilter = useCallback((key: string) => setSpecFilter(key, ""), [setSpecFilter]);
  const setVariantFilter = useCallback(
    (key: string, value: string) => {
      const next = { ...state.variantFilters };
      if (value === "") delete next[key];
      else next[key] = value;
      updateParams({ variantFilters: next, offset: 0 });
    },
    [updateParams, state.variantFilters]
  );
  const clearVariantFilter = useCallback(
    (key: string) => setVariantFilter(key, ""),
    [setVariantFilter]
  );
  const setSort = useCallback((v: SortOption) => updateParams({ sort: v, offset: 0 }), [updateParams]);
  const setOffset = useCallback((v: number) => updateParams({ offset: v }), [updateParams]);

  const clearAllFilters = useCallback(
    () =>
      updateParams({
        searchQuery: "",
        storeFilter: "",
        brandFilter: "",
        categoryFilter: "",
        minDiscount: "",
        specFilters: {},
        variantFilters: {},
        offset: 0,
      }),
    [updateParams]
  );

  // When search clears but URL has sort=relevance, sync URL to newest
  useEffect(() => {
    const rawSort = searchParams.get("sort");
    if (state.searchQuery.trim() === "" && rawSort === "relevance") {
      updateParams({ sort: "newest" });
    }
  }, [state.searchQuery, searchParams, updateParams]);

  return {
    ...state,
    setSearchQuery,
    setStoreFilter,
    setBrandFilter,
    setCategoryFilter,
    setMinDiscount,
    setSpecFilter,
    clearSpecFilter,
    setVariantFilter,
    clearVariantFilter,
    setSort,
    setOffset,
    clearAllFilters,
  };
}
