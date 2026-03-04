import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  triggerScrape,
  triggerEnrich,
  cancelScrapeJob,
  cancelEnrichJob,
  createStore,
  updateStore,
  deleteStore,
  enrichListing,
  createTaxonomyMapping,
  updateTaxonomyMapping,
  deleteTaxonomyMapping,
  triggerRecategorize,
  createSpecFilterConfig,
  updateSpecFilterConfig,
  deleteSpecFilterConfig,
  createSpecValueAlias,
  updateSpecValueAlias,
  deleteSpecValueAlias,
  triggerRenormalizeSpecs,
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
  adminSpecFilterKeys,
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

export function useCancelScrapeJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelScrapeJob,
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: adminScrapeJobKeys.all });
      queryClient.invalidateQueries({ queryKey: adminScrapeJobKeys.detail(jobId) });
    },
  });
}

export function useCancelEnrichJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelEnrichJob,
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: adminEnrichJobKeys.all });
      queryClient.invalidateQueries({ queryKey: adminEnrichJobKeys.detail(jobId) });
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

export function useCreateSpecFilterConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSpecFilterConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminSpecFilterKeys.configs() });
      queryClient.invalidateQueries({ queryKey: adminSpecFilterKeys.specKeys() });
    },
  });
}

export function useUpdateSpecFilterConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: {
        spec_key: string;
        visible?: boolean;
        merge_into?: string | null;
        display_label?: string | null;
        sort_order?: number;
      };
    }) => updateSpecFilterConfig(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminSpecFilterKeys.configs() });
    },
  });
}

export function useDeleteSpecFilterConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSpecFilterConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminSpecFilterKeys.configs() });
    },
  });
}

export function useCreateSpecValueAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { spec_key: string; raw_value: string; display_value: string }) =>
      createSpecValueAlias(body),
    onSuccess: (_, body) => {
      queryClient.invalidateQueries({ queryKey: adminSpecFilterKeys.valueAliases(body.spec_key) });
      queryClient.invalidateQueries({ queryKey: adminSpecFilterKeys.valueAliases() });
    },
  });
}

export function useUpdateSpecValueAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: { spec_key: string; raw_value: string; display_value: string };
    }) => updateSpecValueAlias(id, body),
    onSuccess: (_, { body }) => {
      queryClient.invalidateQueries({ queryKey: adminSpecFilterKeys.valueAliases(body.spec_key) });
      queryClient.invalidateQueries({ queryKey: adminSpecFilterKeys.valueAliases() });
    },
  });
}

export function useDeleteSpecValueAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSpecValueAlias,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminSpecFilterKeys.all });
    },
  });
}

export function useTriggerRenormalizeSpecs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerRenormalizeSpecs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminSpecFilterKeys.specKeys() });
      queryClient.invalidateQueries({ queryKey: adminListingKeys.all });
      queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}
