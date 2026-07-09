import { z } from "zod";

export const ScrapeResultSchema = z.object({
  store_sku: z.string().min(1),
  product_name: z.string().min(1),
  current_price: z.number().positive(),
  original_price: z.number().positive().nullable(),
  product_url: z.string().url(),
  image_url: z.string().url().nullable(),
  brand: z.string().nullable(),
  category_path: z.array(z.string()).nullable(),
  is_in_stock: z.boolean(),
  /** Shopify product handle; API stores as `{store_id}:{handle}`. */
  product_group_key: z.string().nullable().optional(),
  /** Per-variant options, e.g. { Size: "Large", Color: "Black" }. */
  variant_options: z.record(z.string(), z.string()).nullable().optional(),
  /** Set by API-side ingest (not Node scraper) for LLM context. */
  feed_description: z.string().nullable().optional(),
});

export type ScrapeResult = z.infer<typeof ScrapeResultSchema>;

export const STORE_TYPES = [
  "jensonusa",
  "backcountry",
  "worldwidecyclery",
  "revelbikes",
  "ridebicycles",
  "thundermountainbikes",
  "mackcycle",
  "canyon",
  "specialized",
  "trek",
  "universalcycles",
  "n1bikes",
  "foxracing",
  "rideconcepts",
  "leatt",
  "bell",
  "giro",
] as const;
export type StoreType = (typeof STORE_TYPES)[number];

/** Enrich-only store types (no POST /scrape parser). */
export const ENRICH_ONLY_STORE_TYPES = ["competitivecyclist"] as const;
export type EnrichOnlyStoreType = (typeof ENRICH_ONLY_STORE_TYPES)[number];

export const ENRICH_STORE_TYPES = [...STORE_TYPES, ...ENRICH_ONLY_STORE_TYPES] as const;
export type EnrichStoreType = (typeof ENRICH_STORE_TYPES)[number];

export const ScrapeRequestSchema = z.object({
  url: z.string().url(),
  store: z.enum(STORE_TYPES),
});

export type ScrapeRequest = z.infer<typeof ScrapeRequestSchema>;

export const EnrichRequestSchema = z.object({
  url: z.string().url(),
  store: z.enum(ENRICH_STORE_TYPES),
});

export type EnrichRequest = z.infer<typeof EnrichRequestSchema>;
