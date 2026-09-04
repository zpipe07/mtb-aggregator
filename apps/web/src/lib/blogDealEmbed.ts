import type { SortOption } from "@/lib/filterParams";

const VALID_EMBEDS_SORTS = new Set<string>([
  "newest",
  "discount",
  "value",
  "price_asc",
  "price_desc",
  "price_drop",
  "relevance",
]);

/** Coerce MDX attribute values (`maxPrice="150"` or `{150}`) to a positive number. */
export function parseDealEmbedMaxPrice(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return undefined;
}

export function parseDealEmbedSort(value: unknown): SortOption | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (VALID_EMBEDS_SORTS.has(s)) return s as SortOption;
  return undefined;
}

/**
 * Merge sort / max-price / search onto a DealEmbed “see all” path so the
 * category page matches the rail (filters survive an explicit `href`).
 */
export function withDealEmbedQuery(
  href: string,
  opts: { sort?: string; maxPrice?: number; q?: string },
): string {
  const trimmed = href.trim();
  if (!trimmed) return "/deals";
  const qIndex = trimmed.indexOf("?");
  const path = qIndex === -1 ? trimmed : trimmed.slice(0, qIndex);
  const existing = qIndex === -1 ? "" : trimmed.slice(qIndex + 1);
  const params = new URLSearchParams(existing);
  if (opts.q?.trim() && !params.has("q")) params.set("q", opts.q.trim());
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.maxPrice != null) params.set("max_price", String(opts.maxPrice));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function formatDealEmbedCap(maxPrice: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(maxPrice);
}
