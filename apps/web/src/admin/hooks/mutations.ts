import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  triggerScrape,
  triggerEnrich,
  createStore,
  updateStore,
  deleteStore,
  enrichListing,
  createTaxonomyMapping,
  updateTaxonomyMapping,
  deleteTaxonomyMapping,
  triggerRecategorize,
  type StoreFormBody,
} from "../api";
import {
  adminStoreKeys,
  adminStoreTypeKeys,
  adminDashboardKeys,
  adminScrapeJobKeys,
  adminEnrichJobKeys,
  adminListingKeys,
  adminTaxonomyKeys,
} from "./queryKeys";
import { dealKeys } from "../../hooks/queryKeys";

export function useTriggerScrape() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (store?: string) => triggerScrape(store),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminScrapeJobKeys.all });
      queryClient.invalidateQueries({ queryKey: adminDashboardKeys.all });
      queryClient.invalidateQueries({ queryKey: adminStoreKeys.all });
    },
  });
}

export function useTriggerEnrich() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { force?: boolean; store?: string }) =>
      triggerEnrich(opts?.force, opts?.store),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminEnrichJobKeys.all });
      queryClient.invalidateQueries({ queryKey: adminDashboardKeys.all });
      queryClient.invalidateQueries({ queryKey: adminListingKeys.all });
    },
  });
}

export function useCreateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createStore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminStoreKeys.all });
      queryClient.invalidateQueries({ queryKey: adminStoreTypeKeys.all });
    },
  });
}

export function useUpdateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: StoreFormBody }) =>
      updateStore(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminStoreKeys.all });
    },
  });
}

export function useDeleteStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteStore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminStoreKeys.all });
    },
  });
}

export function useEnrichListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: enrichListing,
    onSuccess: (_, listingId) => {
      queryClient.invalidateQueries({ queryKey: adminListingKeys.all });
      queryClient.invalidateQueries({ queryKey: adminListingKeys.detail(listingId) });
    },
  });
}

export function useCreateTaxonomyMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      raw_keywords: string[];
      canonical: string[];
      priority?: number;
    }) => createTaxonomyMapping(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminTaxonomyKeys.all });
    },
  });
}

export function useUpdateTaxonomyMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: { raw_keywords: string[]; canonical: string[]; priority?: number };
    }) => updateTaxonomyMapping(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminTaxonomyKeys.all });
    },
  });
}

export function useDeleteTaxonomyMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTaxonomyMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminTaxonomyKeys.all });
    },
  });
}

export function useTriggerRecategorize() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerRecategorize,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminTaxonomyKeys.all });
      queryClient.invalidateQueries({ queryKey: adminListingKeys.all });
      queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}
