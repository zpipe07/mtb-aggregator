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
});

export type ScrapeResult = z.infer<typeof ScrapeResultSchema>;

export const ScrapeRequestSchema = z.object({
  url: z.string().url(),
  store: z.enum(["jensonusa", "backcountry", "worldwidecyclery"]),
});

export type ScrapeRequest = z.infer<typeof ScrapeRequestSchema>;

export const EnrichRequestSchema = z.object({
  url: z.string().url(),
  store: z.enum(["jensonusa", "backcountry", "worldwidecyclery"]),
});

export type EnrichRequest = z.infer<typeof EnrichRequestSchema>;
