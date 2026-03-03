import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchDeals,
  fetchDeal,
  fetchFacets,
  fetchPriceHistory,
  fetchStores,
  fetchBrands,
  fetchCategories,
  fetchCanonicalCategories,
  DEFAULT_PAGE_SIZE,
  type DealListResponse,
  type FacetsResponse,
} from "../api";
import {
  dealKeys,
  facetKeys,
  storeKeys,
  brandKeys,
  categoryKeys,
  canonicalCategoryKeys,
} from "./queryKeys";

export interface DealsParams {
  limit?: number;
  offset?: number;
  store?: string;
  brand?: string;
  category?: string;
  canonical_category?: string;
  min_discount?: number;
  spec_key?: string;
  spec_value?: string;
  specFilters?: Record<string, string>;
  q?: string;
  sort?: string;
}

function buildDealsParams(params: DealsParams) {
  return {
    limit: params.limit ?? DEFAULT_PAGE_SIZE,
    offset: params.offset ?? 0,
    store: params.store || undefined,
    brand: params.brand || undefined,
    category: params.category || undefined,
    canonical_category: params.canonical_category || undefined,
    min_discount: params.min_discount,
    spec_key: params.spec_key || undefined,
    spec_value: params.spec_value || undefined,
    specFilters: params.specFilters,
    q: params.q?.trim() || undefined,
    sort: params.sort ?? "newest",
  };
}

export function useDeals(params: DealsParams) {
  const normalized = buildDealsParams(params);
  return useQuery<DealListResponse>({
    queryKey: dealKeys.list(normalized),
    queryFn: () => fetchDeals(normalized),
  });
}

export function useDeal(id: number | null) {
  return useQuery({
    queryKey: dealKeys.detail(id ?? 0),
    queryFn: () => fetchDeal(id!),
    enabled: id != null,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePriceHistory(dealId: number | null) {
  return useQuery({
    queryKey: dealKeys.priceHistory(dealId ?? 0),
    queryFn: () => fetchPriceHistory(dealId!),
    enabled: dealId != null,
    staleTime: 5 * 60 * 1000,
  });
}

const REFERENCE_STALE = 10 * 60 * 1000;

export function useStores() {
  return useQuery({
    queryKey: storeKeys.all,
    queryFn: fetchStores,
    staleTime: REFERENCE_STALE,
  });
}

export function useBrands() {
  return useQuery({
    queryKey: brandKeys.all,
    queryFn: fetchBrands,
    staleTime: REFERENCE_STALE,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: fetchCategories,
    staleTime: REFERENCE_STALE,
  });
}

export function useCanonicalCategories() {
  return useQuery({
    queryKey: canonicalCategoryKeys.all,
    queryFn: fetchCanonicalCategories,
    staleTime: REFERENCE_STALE,
  });
}

export interface FacetsParams {
  store?: string;
  brand?: string;
  category?: string;
  canonical_category?: string;
  min_discount?: number;
  q?: string;
  specFilters?: Record<string, string>;
}

function buildFacetsParams(params: FacetsParams) {
  return {
    store: params.store || undefined,
    brand: params.brand || undefined,
    category: params.category || undefined,
    canonical_category: params.canonical_category || undefined,
    min_discount: params.min_discount,
    q: params.q?.trim() || undefined,
    specFilters: params.specFilters,
  };
}

export function useFilterFacets(params: FacetsParams) {
  const normalized = buildFacetsParams(params);
  return useQuery<FacetsResponse>({
    queryKey: facetKeys.list(normalized),
    queryFn: () => fetchFacets(normalized),
    placeholderData: keepPreviousData,
  });
}
