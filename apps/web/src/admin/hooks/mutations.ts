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
  setListingHidden,
  setListingLLMOverrides,
  runLLMExtractionForCategory,
  createTaxonomyMapping,
  updateTaxonomyMapping,
  deleteTaxonomyMapping,
  reorderTaxonomyMappings,
  triggerRecategorize,
  createSpecFilterConfig,
  updateSpecFilterConfig,
  deleteSpecFilterConfig,
  createSpecValueAlias,
  updateSpecValueAlias,
  deleteSpecValueAlias,
  triggerRenormalizeSpecs,
  createSpecNormalizationRule,
  updateSpecNormalizationRule,
  deleteSpecNormalizationRule,
  createSpecKeyAlias,
  updateSpecKeyAlias,
  deleteSpecKeyAlias,
  createLLMProfile,
  updateLLMProfile,
  deleteLLMProfile,
  testLLMProfile,
  createLLMExtractionFieldDef,
  updateLLMExtractionFieldDef,
  deleteLLMExtractionFieldDef,
  type LLMProfileFieldInput,
  updateCategoryClassifier,
  testCategoryClassifier,
  runCategoryClassifier,
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
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
  adminNormalizationKeys,
  adminLLMProfileKeys,
  adminLLMFieldDefKeys,
  adminCategoryClassifierKeys,
  adminCategoryKeys,
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

export function useSetListingHidden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hidden }: { id: number; hidden: boolean }) => setListingHidden(id, hidden),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: adminListingKeys.all });
      queryClient.invalidateQueries({ queryKey: adminListingKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}

export function useSetListingLLMOverrides() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, overrides }: { id: number; overrides: Record<string, string | null> }) =>
      setListingLLMOverrides(id, overrides),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: adminListingKeys.all });
      queryClient.invalidateQueries({ queryKey: adminListingKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}

export function useRunLLMExtractionForCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runLLMExtractionForCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminListingKeys.all });
      queryClient.invalidateQueries({ queryKey: adminLLMProfileKeys.all });
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

export function useReorderTaxonomyMappings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: { id: number; priority: number }[]) =>
      reorderTaxonomyMappings(updates),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: adminTaxonomyKeys.all });
      const previous = queryClient.getQueryData<Array<{ id: number; priority: number; [k: string]: unknown }>>(
        adminTaxonomyKeys.all
      );
      const priorityMap = new Map(updates.map((u) => [u.id, u.priority]));
      if (previous) {
        const optimistic = previous
          .map((m) => ({ ...m, priority: priorityMap.get(m.id) ?? m.priority }))
          .sort((a, b) => b.priority - a.priority);
        queryClient.setQueryData(adminTaxonomyKeys.all, optimistic);
      }
      return { previous };
    },
    onError: (_err, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(adminTaxonomyKeys.all, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: adminTaxonomyKeys.all });
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
      queryClient.invalidateQueries({ queryKey: adminNormalizationKeys.all });
    },
  });
}

export function useCreateSpecNormalizationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSpecNormalizationRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminNormalizationKeys.all });
    },
  });
}

export function useUpdateSpecNormalizationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: { spec_key: string; rule_type: string; config?: Record<string, unknown>; priority?: number };
    }) => updateSpecNormalizationRule(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminNormalizationKeys.all });
    },
  });
}

export function useDeleteSpecNormalizationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSpecNormalizationRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminNormalizationKeys.all });
    },
  });
}

export function useCreateSpecKeyAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSpecKeyAlias,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminNormalizationKeys.all });
    },
  });
}

export function useUpdateSpecKeyAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: { raw_substr: string; canonical_key: string; priority?: number };
    }) => updateSpecKeyAlias(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminNormalizationKeys.all });
    },
  });
}

export function useDeleteSpecKeyAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSpecKeyAlias,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminNormalizationKeys.all });
    },
  });
}

export function useCreateLLMProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createLLMProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminLLMProfileKeys.all });
    },
  });
}

export function useUpdateLLMProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: {
        canonical_category?: string[];
        name?: string;
        system_prompt?: string;
        extraction_schema?: Record<string, unknown>;
        profile_fields?: LLMProfileFieldInput[];
        enabled?: boolean;
      };
    }) => updateLLMProfile(id, body),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: adminLLMProfileKeys.all });
      queryClient.invalidateQueries({ queryKey: adminLLMProfileKeys.detail(id) });
    },
  });
}

export function useDeleteLLMProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLLMProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminLLMProfileKeys.all });
    },
  });
}

export function useTestLLMProfile() {
  return useMutation({
    mutationFn: ({ profileId, listingId }: { profileId: number; listingId: number }) =>
      testLLMProfile(profileId, listingId),
  });
}

export function useCreateLLMExtractionFieldDef() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createLLMExtractionFieldDef,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminLLMFieldDefKeys.all });
    },
  });
}

export function useUpdateLLMExtractionFieldDef() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: Parameters<typeof updateLLMExtractionFieldDef>[1];
    }) => updateLLMExtractionFieldDef(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminLLMFieldDefKeys.all });
    },
  });
}

export function useDeleteLLMExtractionFieldDef() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLLMExtractionFieldDef,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminLLMFieldDefKeys.all });
    },
  });
}

export function useUpdateCategoryClassifier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      system_prompt?: string;
      confidence_threshold?: number;
      enabled?: boolean;
    }) => updateCategoryClassifier(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminCategoryClassifierKeys.all });
    },
  });
}

export function useTestCategoryClassifier() {
  return useMutation({
    mutationFn: (listingId: number) => testCategoryClassifier(listingId),
  });
}

export function useRunCategoryClassifier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params?: { store?: string; canonical_category?: string[]; limit?: number }) =>
      runCategoryClassifier(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminListingKeys.all });
      queryClient.invalidateQueries({ queryKey: adminCategoryClassifierKeys.all });
    },
  });
}

export function useCreateAdminCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAdminCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminCategoryKeys.all });
      queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}

export function useUpdateAdminCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: { slug: string; name: string; sort_order?: number };
    }) => updateAdminCategory(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminCategoryKeys.all });
      queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}

export function useDeleteAdminCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAdminCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminCategoryKeys.all });
      queryClient.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}
