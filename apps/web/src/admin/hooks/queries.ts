import { useQuery } from "@tanstack/react-query";
import {
  fetchDashboard,
  fetchAdminStores,
  fetchStoreTypes,
  fetchStoreTypesWithEnrichers,
  fetchScrapeJobs,
  fetchScrapeJob,
  fetchEnrichJobs,
  fetchEnrichJob,
  fetchAdminListings,
  fetchAdminListing,
  fetchTaxonomyMappings,
  fetchSpecFilterConfigs,
  fetchSpecValueAliases,
  fetchSpecKeys,
} from "../api";
import {
  adminDashboardKeys,
  adminStoreKeys,
  adminStoreTypeKeys,
  adminStoreTypesWithEnrichersKeys,
  adminScrapeJobKeys,
  adminEnrichJobKeys,
  adminListingKeys,
  adminTaxonomyKeys,
  adminSpecFilterKeys,
} from "./queryKeys";

export function useAdminDashboard() {
  return useQuery({
    queryKey: adminDashboardKeys.all,
    queryFn: fetchDashboard,
    staleTime: 30 * 1000,
  });
}

export function useAdminStores() {
  return useQuery({
    queryKey: adminStoreKeys.all,
    queryFn: fetchAdminStores,
    staleTime: 60 * 1000,
  });
}

export function useStoreTypes() {
  return useQuery({
    queryKey: adminStoreTypeKeys.all,
    queryFn: fetchStoreTypes,
    staleTime: 5 * 60 * 1000,
  });
}

export function useStoreTypesWithEnrichers() {
  return useQuery({
    queryKey: adminStoreTypesWithEnrichersKeys.all,
    queryFn: fetchStoreTypesWithEnrichers,
    staleTime: 5 * 60 * 1000,
  });
}

export interface ScrapeJobsParams {
  limit?: number;
  offset?: number;
  store_id?: number;
}

export function useScrapeJobs(params: ScrapeJobsParams = {}) {
  const normalized = {
    limit: params.limit ?? 20,
    offset: params.offset ?? 0,
    store_id: params.store_id,
  };
  return useQuery({
    queryKey: adminScrapeJobKeys.list(normalized),
    queryFn: () => fetchScrapeJobs(normalized),
  });
}

export function useScrapeJob(id: number | null) {
  return useQuery({
    queryKey: adminScrapeJobKeys.detail(id ?? 0),
    queryFn: () => fetchScrapeJob(id!),
    enabled: id != null,
  });
}

export interface EnrichJobsParams {
  limit?: number;
  offset?: number;
}

export function useEnrichJobs(params: EnrichJobsParams = {}) {
  const normalized = {
    limit: params.limit ?? 20,
    offset: params.offset ?? 0,
  };
  return useQuery({
    queryKey: adminEnrichJobKeys.list(normalized),
    queryFn: () => fetchEnrichJobs(normalized),
  });
}

export function useEnrichJob(id: number | null) {
  return useQuery({
    queryKey: adminEnrichJobKeys.detail(id ?? 0),
    queryFn: () => fetchEnrichJob(id!),
    enabled: id != null,
  });
}

export interface AdminListingsParams {
  store_id?: number;
  brand?: string;
  has_canonical_category?: boolean;
  has_enrichment?: boolean;
  in_stock?: boolean;
  category?: string;
  canonical_category?: string;
  q?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export function useAdminListings(params: AdminListingsParams = {}) {
  const normalized = {
    ...params,
    limit: params.limit ?? 25,
    offset: params.offset ?? 0,
  };
  return useQuery({
    queryKey: adminListingKeys.list(normalized),
    queryFn: () => fetchAdminListings(normalized),
  });
}

export function useAdminListing(id: number | null) {
  return useQuery({
    queryKey: adminListingKeys.detail(id ?? 0),
    queryFn: () => fetchAdminListing(id!),
    enabled: id != null,
  });
}

export function useTaxonomyMappings() {
  return useQuery({
    queryKey: adminTaxonomyKeys.all,
    queryFn: fetchTaxonomyMappings,
    staleTime: 60 * 1000,
  });
}

export function useSpecFilterConfigs() {
  return useQuery({
    queryKey: adminSpecFilterKeys.configs(),
    queryFn: fetchSpecFilterConfigs,
    staleTime: 60 * 1000,
  });
}

export function useSpecValueAliases(specKey?: string) {
  return useQuery({
    queryKey: adminSpecFilterKeys.valueAliases(specKey),
    queryFn: () => fetchSpecValueAliases(specKey),
    staleTime: 60 * 1000,
  });
}

export function useSpecKeys() {
  return useQuery({
    queryKey: adminSpecFilterKeys.specKeys(),
    queryFn: fetchSpecKeys,
    staleTime: 60 * 1000,
  });
}
