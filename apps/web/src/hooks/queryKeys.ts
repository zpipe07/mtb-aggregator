export const dealKeys = {
  all: ["deals"] as const,
  lists: () => [...dealKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...dealKeys.lists(), filters] as const,
  details: () => [...dealKeys.all, "detail"] as const,
  detail: (id: number) => [...dealKeys.details(), id] as const,
  priceHistory: (id: number) =>
    [...dealKeys.detail(id), "priceHistory"] as const,
};

export const storeKeys = {
  all: ["stores"] as const,
};

export const brandKeys = { all: ["brands"] as const };
export const categoryKeys = { all: ["categories"] as const };
export const canonicalCategoryKeys = { all: ["canonicalCategories"] as const };
export const specValueKeys = {
  all: ["specValues"] as const,
  byKey: (key: string) => [...specValueKeys.all, key] as const,
};
export const statusKeys = { all: ["status"] as const };

export const facetKeys = {
  all: ["facets"] as const,
  list: (filters: Record<string, unknown>) =>
    [...facetKeys.all, "list", filters] as const,
};
