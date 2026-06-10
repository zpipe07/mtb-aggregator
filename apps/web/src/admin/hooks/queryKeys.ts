export const adminStoreKeys = {
  all: ["admin", "stores"] as const,
  detail: (id: number) => [...adminStoreKeys.all, id] as const,
};

export const adminStoreTypeKeys = {
  all: ["admin", "storeTypes"] as const,
};

export const adminStoreTypesWithEnrichersKeys = {
  all: ["admin", "storeTypesWithEnrichers"] as const,
};

export const adminDashboardKeys = {
  all: ["admin", "dashboard"] as const,
};

export const adminScrapeJobKeys = {
  all: ["admin", "scrapeJobs"] as const,
  list: (params: { limit?: number; offset?: number; store_id?: number }) =>
    [...adminScrapeJobKeys.all, "list", params] as const,
  detail: (id: number) => [...adminScrapeJobKeys.all, "detail", id] as const,
};

export const adminEnrichJobKeys = {
  all: ["admin", "enrichJobs"] as const,
  list: (params: { limit?: number; offset?: number }) =>
    [...adminEnrichJobKeys.all, "list", params] as const,
  detail: (id: number) => [...adminEnrichJobKeys.all, "detail", id] as const,
};

export const adminListingKeys = {
  all: ["admin", "listings"] as const,
  lists: () => [...adminListingKeys.all, "list"] as const,
  list: (params: Record<string, unknown>) =>
    [...adminListingKeys.lists(), params] as const,
  detail: (id: number) => [...adminListingKeys.all, "detail", id] as const,
};

export const adminTaxonomyKeys = {
  all: ["admin", "taxonomy"] as const,
};

export const adminCategoryKeys = {
  all: ["admin", "categories"] as const,
  profileFields: (categoryId: number) =>
    [...adminCategoryKeys.all, "profileFields", categoryId] as const,
};

export const adminSpecFilterKeys = {
  all: ["admin", "specFilter"] as const,
  configs: () => [...adminSpecFilterKeys.all, "configs"] as const,
  valueAliases: (specKey?: string) =>
    [...adminSpecFilterKeys.all, "valueAliases", specKey ?? ""] as const,
  specKeys: () => [...adminSpecFilterKeys.all, "specKeys"] as const,
};

export const adminNormalizationKeys = {
  all: ["admin", "normalization"] as const,
  unmapped: () => [...adminNormalizationKeys.all, "unmapped"] as const,
  rules: () => [...adminNormalizationKeys.all, "rules"] as const,
  keyAliases: () => [...adminNormalizationKeys.all, "keyAliases"] as const,
};

export const adminLLMProfileKeys = {
  all: ["admin", "llmProfiles"] as const,
  detail: (id: number) => [...adminLLMProfileKeys.all, id] as const,
};

export const adminLLMFieldDefKeys = {
  all: ["admin", "llmFieldDefs"] as const,
  list: (q: string) => [...adminLLMFieldDefKeys.all, "list", q] as const,
};

export const adminCategoryClassifierKeys = {
  all: ["admin", "categoryClassifier"] as const,
};

export const adminDBKeys = {
  all: ["admin", "db"] as const,
  migrations: () => [...adminDBKeys.all, "migrations"] as const,
};
