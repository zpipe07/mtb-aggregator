const VALID_SORTS = ["newest", "discount", "price_asc", "price_desc", "relevance"] as const;
export type SortOption = (typeof VALID_SORTS)[number];

const SPEC_PREFIX = "spec_";
const VARIANT_PREFIX = "variant_";

export interface ParsedFilterParams {
  searchQuery: string;
  storeFilter: string;
  brandFilter: string;
  categoryFilter: string;
  minDiscount: string;
  specFilters: Record<string, string>;
  variantFilters: Record<string, string>;
  sort: SortOption;
  offset: number;
}

/** Get string value from Next.js searchParams (can be string | string[]) */
function getParam(
  params: Record<string, string | string[] | undefined>,
  key: string
): string {
  const v = params[key];
  if (v == null) return "";
  return Array.isArray(v) ? v[0] ?? "" : v;
}

/** Parse filter params from Next.js server searchParams */
export function parseFilterParamsFromSearch(
  params: Record<string, string | string[] | undefined>
): ParsedFilterParams {
  const searchQuery = getParam(params, "q") ?? "";
  const storeFilter = getParam(params, "store") ?? "";
  const brandFilter = getParam(params, "brand") ?? "";
  const categoryFilter = getParam(params, "category") ?? "";
  const minDiscount = getParam(params, "min_discount") ?? "";
  const sortParam = getParam(params, "sort");
  const sort = (VALID_SORTS.includes(sortParam as SortOption)
    ? sortParam
    : "newest") as SortOption;
  const offsetParam = getParam(params, "offset");
  const offset = Math.max(0, parseInt(offsetParam ?? "0", 10) || 0);

  const specFilters: Record<string, string> = {};
  const variantFilters: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith(SPEC_PREFIX) && value != null) {
      const specKey = key.slice(SPEC_PREFIX.length);
      const v = Array.isArray(value) ? value[0] : value;
      if (specKey && v) specFilters[specKey] = v;
    }
    if (key.startsWith(VARIANT_PREFIX) && value != null) {
      const vk = key.slice(VARIANT_PREFIX.length);
      const v = Array.isArray(value) ? value[0] : value;
      if (vk && v) variantFilters[vk] = v;
    }
  }

  const effectiveSort =
    searchQuery.trim() === "" && sort === "relevance" ? ("newest" as SortOption) : sort;

  return {
    searchQuery,
    storeFilter,
    brandFilter,
    categoryFilter,
    minDiscount,
    specFilters,
    variantFilters,
    sort: effectiveSort,
    offset,
  };
}

/** Parse from URLSearchParams (client-side) */
export function parseFilterParamsFromURL(
  searchParams: URLSearchParams | { get: (k: string) => string | null; toString: () => string }
): ParsedFilterParams {
  const params = new URLSearchParams(searchParams.toString());
  const searchQuery = params.get("q") ?? "";
  const storeFilter = params.get("store") ?? "";
  const brandFilter = params.get("brand") ?? "";
  const categoryFilter = params.get("category") ?? "";
  const minDiscount = params.get("min_discount") ?? "";
  const sortParam = params.get("sort");
  const sort = (VALID_SORTS.includes(sortParam as SortOption)
    ? sortParam
    : "newest") as SortOption;
  const offsetParam = params.get("offset");
  const offset = Math.max(0, parseInt(offsetParam ?? "0", 10) || 0);

  const specFilters: Record<string, string> = {};
  const variantFilters: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key.startsWith(SPEC_PREFIX)) {
      const specKey = key.slice(SPEC_PREFIX.length);
      if (specKey) specFilters[specKey] = value;
    }
    if (key.startsWith(VARIANT_PREFIX)) {
      const vk = key.slice(VARIANT_PREFIX.length);
      if (vk) variantFilters[vk] = value;
    }
  });

  const effectiveSort =
    searchQuery.trim() === "" && sort === "relevance" ? ("newest" as SortOption) : sort;

  return {
    searchQuery,
    storeFilter,
    brandFilter,
    categoryFilter,
    minDiscount,
    specFilters,
    variantFilters,
    sort: effectiveSort,
    offset,
  };
}
