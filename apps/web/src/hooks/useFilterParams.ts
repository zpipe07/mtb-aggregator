import { useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";

const VALID_SORTS = ["newest", "discount", "price_asc", "price_desc", "relevance"] as const;
export type SortOption = (typeof VALID_SORTS)[number];

const SPEC_PREFIX = "spec_";

function parseParams(searchParams: URLSearchParams) {
  const searchQuery = searchParams.get("q") ?? "";
  const storeFilter = searchParams.get("store") ?? "";
  const brandFilter = searchParams.get("brand") ?? "";
  const categoryFilter = searchParams.get("category") ?? ""; // slug, e.g. bikes-mountain
  const minDiscount = searchParams.get("min_discount") ?? "";
  const sortParam = searchParams.get("sort");
  const sort = (VALID_SORTS.includes(sortParam as SortOption) ? sortParam : "newest") as SortOption;
  const offsetParam = searchParams.get("offset");
  const offset = Math.max(0, parseInt(offsetParam ?? "0", 10) || 0);

  const specFilters: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key.startsWith(SPEC_PREFIX)) {
      const specKey = key.slice(SPEC_PREFIX.length);
      if (specKey) specFilters[specKey] = value;
    }
  });

  // Relevance only valid when search is active
  const effectiveSort =
    searchQuery.trim() === "" && sort === "relevance" ? ("newest" as SortOption) : sort;

  return {
    searchQuery,
    storeFilter,
    brandFilter,
    categoryFilter,
    minDiscount,
    specFilters,
    sort: effectiveSort,
    offset,
  };
}

function applyToParams(
  prev: URLSearchParams,
  updates: Partial<{
    searchQuery: string;
    storeFilter: string;
    brandFilter: string;
    categoryFilter: string;
    minDiscount: string;
    specFilters: Record<string, string>;
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

  return next;
}

export function useFilterParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = parseParams(searchParams);

  const updateParams = useCallback(
    (
      updates: Partial<{
        searchQuery: string;
        storeFilter: string;
        brandFilter: string;
        categoryFilter: string;
        minDiscount: string;
        specFilters: Record<string, string>;
        sort: SortOption;
        offset: number;
      }>
    ) => {
      setSearchParams((prev) => applyToParams(prev, updates), { replace: true });
    },
    [setSearchParams]
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
    (v: string) => updateParams({ categoryFilter: v, specFilters: {}, offset: 0 }),
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
    setSort,
    setOffset,
    clearAllFilters,
  };
}
