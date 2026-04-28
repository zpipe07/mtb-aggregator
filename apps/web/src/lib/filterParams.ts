const VALID_SORTS = [
  "newest",
  "discount",
  "value",
  "price_asc",
  "price_desc",
  "relevance",
] as const;
export type SortOption = (typeof VALID_SORTS)[number];

const SPEC_PREFIX = "spec_";
const VARIANT_PREFIX = "variant_";

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export interface ParsedFilterParams {
  searchQuery: string;
  storeFilter: string;
  /** Multiple brands (OR). From repeated `brand` query params. */
  brandFilters: string[];
  categoryFilter: string;
  minDiscount: string;
  /** Minimum current_price (inclusive); from `min_price` query param */
  minPrice: string;
  /** From `exclude_category_slug` query param */
  excludeCategorySlug: string;
  specFilters: Record<string, string[]>;
  variantFilters: Record<string, string[]>;
  sort: SortOption;
  offset: number;
}

/** Get string value from Next.js searchParams (can be string | string[]) */
function getParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const v = params[key];
  if (v == null) return "";
  return Array.isArray(v) ? v[0] ?? "" : v;
}

function collectBrandFilters(
  params: Record<string, string | string[] | undefined>,
): string[] {
  const v = params.brand;
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  return dedupePreserveOrder(
    arr.map((s) => s.trim()).filter((s) => s !== ""),
  );
}

function collectPrefixedMulti(
  params: Record<string, string | string[] | undefined>,
  prefix: string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(params)) {
    if (!key.startsWith(prefix) || raw == null) continue;
    const subKey = key.slice(prefix.length).trim();
    if (!subKey) continue;
    const vals = Array.isArray(raw) ? raw : [raw];
    for (const v of vals) {
      const t = v.trim();
      if (!t) continue;
      out[subKey] = out[subKey] ?? [];
      out[subKey].push(t);
    }
  }
  for (const k of Object.keys(out)) {
    out[k] = dedupePreserveOrder(out[k]);
    if (out[k].length === 0) delete out[k];
  }
  return out;
}

/** Parse filter params from Next.js server searchParams */
export function parseFilterParamsFromSearch(
  params: Record<string, string | string[] | undefined>,
): ParsedFilterParams {
  const searchQuery = getParam(params, "q") ?? "";
  const storeFilter = getParam(params, "store") ?? "";
  const brandFilters = collectBrandFilters(params);
  const categoryFilter = getParam(params, "category") ?? "";
  const minDiscount = getParam(params, "min_discount") ?? "";
  const minPrice = getParam(params, "min_price") ?? "";
  const excludeCategorySlug = getParam(params, "exclude_category_slug") ?? "";
  const sortParam = getParam(params, "sort");
  const sort = (VALID_SORTS.includes(sortParam as SortOption)
    ? sortParam
    : "discount") as SortOption;
  const offsetParam = getParam(params, "offset");
  const offset = Math.max(0, parseInt(offsetParam ?? "0", 10) || 0);

  const specFilters = collectPrefixedMulti(params, SPEC_PREFIX);
  const variantFilters = collectPrefixedMulti(params, VARIANT_PREFIX);

  const effectiveSort =
    searchQuery.trim() === "" && sort === "relevance"
      ? ("discount" as SortOption)
      : sort;

  return {
    searchQuery,
    storeFilter,
    brandFilters,
    categoryFilter,
    minDiscount,
    minPrice,
    excludeCategorySlug,
    specFilters,
    variantFilters,
    sort: effectiveSort,
    offset,
  };
}

/** Parse from URLSearchParams (client-side) */
export function parseFilterParamsFromURL(
  searchParams: URLSearchParams | { get: (k: string) => string | null; toString: () => string },
): ParsedFilterParams {
  const params = new URLSearchParams(searchParams.toString());
  const searchQuery = params.get("q") ?? "";
  const storeFilter = params.get("store") ?? "";
  const brandFilters = dedupePreserveOrder(
    params.getAll("brand").map((s) => s.trim()).filter(Boolean),
  );
  const categoryFilter = params.get("category") ?? "";
  const minDiscount = params.get("min_discount") ?? "";
  const minPrice = params.get("min_price") ?? "";
  const excludeCategorySlug = params.get("exclude_category_slug") ?? "";
  const sortParam = params.get("sort");
  const sort = (VALID_SORTS.includes(sortParam as SortOption)
    ? sortParam
    : "discount") as SortOption;
  const offsetParam = params.get("offset");
  const offset = Math.max(0, parseInt(offsetParam ?? "0", 10) || 0);

  const specFilters: Record<string, string[]> = {};
  const variantFilters: Record<string, string[]> = {};
  params.forEach((value, key) => {
    const t = value.trim();
    if (!t) return;
    if (key.startsWith(SPEC_PREFIX)) {
      const specKey = key.slice(SPEC_PREFIX.length);
      if (!specKey) return;
      specFilters[specKey] = specFilters[specKey] ?? [];
      specFilters[specKey].push(t);
    }
    if (key.startsWith(VARIANT_PREFIX)) {
      const vk = key.slice(VARIANT_PREFIX.length);
      if (!vk) return;
      variantFilters[vk] = variantFilters[vk] ?? [];
      variantFilters[vk].push(t);
    }
  });
  for (const k of Object.keys(specFilters)) {
    specFilters[k] = dedupePreserveOrder(specFilters[k]);
    if (specFilters[k].length === 0) delete specFilters[k];
  }
  for (const k of Object.keys(variantFilters)) {
    variantFilters[k] = dedupePreserveOrder(variantFilters[k]);
    if (variantFilters[k].length === 0) delete variantFilters[k];
  }

  const effectiveSort =
    searchQuery.trim() === "" && sort === "relevance"
      ? ("discount" as SortOption)
      : sort;

  return {
    searchQuery,
    storeFilter,
    brandFilters,
    categoryFilter,
    minDiscount,
    minPrice,
    excludeCategorySlug,
    specFilters,
    variantFilters,
    sort: effectiveSort,
    offset,
  };
}
