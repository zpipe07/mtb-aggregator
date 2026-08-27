import {
  useEffect,
  useCallback,
  useTransition,
  useOptimistic,
  useMemo,
} from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import type { CategoryTreeNode } from "../api";
import {
  parseFilterParamsFromURL,
  type ParsedFilterParams,
  type SortOption,
} from "../lib/filterParams";
import {
  buildDealsCategoryPath,
  parseCategorySlugFromDealsPath,
} from "../lib/dealsCategoryPath";

export type { SortOption };

const SPEC_PREFIX = "spec_";

function mergeCategoryFromPath(
  parsed: ParsedFilterParams,
  pathname: string,
): ParsedFilterParams {
  const fromPath = parseCategorySlugFromDealsPath(pathname);
  return {
    ...parsed,
    categoryFilter: fromPath ?? parsed.categoryFilter,
  };
}

/** Full replace for `useOptimistic` — incoming navigation target wins. */
function optimisticFilterReducer(
  _current: ParsedFilterParams,
  next: ParsedFilterParams,
): ParsedFilterParams {
  return next;
}

function applyToParams(
  prev: URLSearchParams,
  updates: Partial<{
    searchQuery: string;
    storeFilter: string;
    brandFilters: string[];
    categoryFilter: string;
    minDiscount: string;
    minPrice: string;
    maxPrice: string;
    excludeCategorySlug: string;
    specFilters: Record<string, string[]>;
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
  if (updates.categoryFilter !== undefined)
    set("category", updates.categoryFilter);
  if (updates.minDiscount !== undefined) set("min_discount", updates.minDiscount);
  if (updates.minPrice !== undefined) set("min_price", updates.minPrice);
  if (updates.maxPrice !== undefined) set("max_price", updates.maxPrice);
  if (updates.excludeCategorySlug !== undefined)
    set("exclude_category_slug", updates.excludeCategorySlug);
  if (updates.sort !== undefined)
    set("sort", updates.sort === "value" ? "" : updates.sort);
  if (updates.offset !== undefined)
    set("offset", updates.offset === 0 ? "" : String(updates.offset));

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

  const searchParamsString = searchParams.toString();
  const canonical = useMemo((): ParsedFilterParams => {
    const base = parseFilterParamsFromURL(
      new URLSearchParams(searchParamsString),
    );
    const categoryFromPath = parseCategorySlugFromDealsPath(pathname);
    return {
      ...base,
      categoryFilter: categoryFromPath ?? base.categoryFilter,
    };
  }, [searchParamsString, pathname]);

  const [display, addOptimistic] = useOptimistic(
    canonical,
    optimisticFilterReducer,
  );

  const beginReplace = useCallback(
    (nextParams: URLSearchParams, targetPathname: string) => {
      const merged = mergeCategoryFromPath(
        parseFilterParamsFromURL(nextParams),
        targetPathname,
      );
      const qs = nextParams.toString();
      // useOptimistic setter must run inside startTransition (or an Action).
      startTransition(() => {
        addOptimistic(merged);
        router.replace(qs ? `${targetPathname}?${qs}` : targetPathname);
      });
    },
    [router, addOptimistic, startTransition],
  );

  const updateParams = useCallback(
    (
      updates: Partial<{
        searchQuery: string;
        storeFilter: string;
        brandFilters: string[];
        categoryFilter: string;
        minDiscount: string;
        minPrice: string;
        maxPrice: string;
        excludeCategorySlug: string;
        specFilters: Record<string, string[]>;
        sort: SortOption;
        offset: number;
      }>,
    ) => {
      const next = applyToParams(
        new URLSearchParams(searchParamsString),
        updates,
      );
      beginReplace(next, pathname);
    },
    [searchParamsString, pathname, beginReplace],
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
      const cur = display.brandFilters;
      const idx = cur.indexOf(v);
      const nextBrands = idx >= 0 ? cur.filter((x) => x !== v) : [...cur, v];
      updateParams({ brandFilters: nextBrands, offset: 0 });
    },
    [updateParams, display.brandFilters],
  );
  const clearBrandFilters = useCallback(
    () => updateParams({ brandFilters: [], offset: 0 }),
    [updateParams],
  );
  const setCategoryFilter = useCallback(
    (v: string) => {
      const raw = new URLSearchParams(searchParamsString);
      raw.delete("category");
      const next = applyToParams(raw, {
        categoryFilter: "",
        specFilters: {},
        offset: 0,
      });
      const targetPath = v ? buildDealsCategoryPath(v, categoryTree) : "/deals";
      beginReplace(next, targetPath);
    },
    [searchParamsString, beginReplace, categoryTree],
  );
  const setMinDiscount = useCallback(
    (v: string) => updateParams({ minDiscount: v, offset: 0 }),
    [updateParams],
  );
  const setMinPrice = useCallback(
    (v: string) => updateParams({ minPrice: v, offset: 0 }),
    [updateParams],
  );
  const setMaxPrice = useCallback(
    (v: string) => updateParams({ maxPrice: v, offset: 0 }),
    [updateParams],
  );
  const toggleSpecFilter = useCallback(
    (key: string, value: string) => {
      const v = value.trim();
      if (!v) return;
      const cur = display.specFilters[key] ?? [];
      const idx = cur.indexOf(v);
      const nextVals = idx >= 0 ? cur.filter((x) => x !== v) : [...cur, v];
      const next = { ...display.specFilters };
      if (nextVals.length === 0) delete next[key];
      else next[key] = nextVals;
      updateParams({ specFilters: next, offset: 0 });
    },
    [updateParams, display.specFilters],
  );
  const clearSpecFilter = useCallback(
    (key: string) => {
      const next = { ...display.specFilters };
      delete next[key];
      updateParams({ specFilters: next, offset: 0 });
    },
    [updateParams, display.specFilters],
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
      maxPrice: "",
      excludeCategorySlug: "",
      specFilters: {},
      offset: 0,
    });
  }, [updateParams]);

  // Canonical URL only: when search clears but `sort=relevance` remains, fix the URL.
  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const rawSort = params.get("sort");
    const q = params.get("q") ?? "";
    if (q.trim() === "" && rawSort === "relevance") {
      updateParams({ sort: "value" });
    }
  }, [searchParamsString, updateParams]);

  return {
    ...display,
    isPending,
    setSearchQuery,
    setStoreFilter,
    toggleBrandFilter,
    clearBrandFilters,
    setCategoryFilter,
    setMinDiscount,
    setMinPrice,
    setMaxPrice,
    toggleSpecFilter,
    clearSpecFilter,
    setSort,
    setOffset,
    clearAllFilters,
  };
}
