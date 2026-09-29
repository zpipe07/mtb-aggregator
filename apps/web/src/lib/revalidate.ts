/**
 * Public ISR + fetch cache TTL. Aligned with API scrape cadence (~4h); shorter
 * intervals only increase Vercel ISR writes without fresher listing data.
 *
 * Route `export const revalidate` must use the literal `14400` — Next.js does not
 * accept imported identifiers in page config (see invalid-page-config).
 *
 * Dynamic segments (`[id]`, `[...slug]`) stay `private, no-store` unless the page
 * also exports `generateStaticParams` (an empty array enables on-demand ISR).
 * Awaiting `searchParams` forces dynamic rendering on its own, so filtered
 * listing routes are not covered by that export.
 *
 * The shortest `fetch` `revalidate` in a tree wins over the segment config.
 * Homepage giveaways must not use the 60s giveaways TTL or `/` revalidates
 * every minute.
 */
export const PUBLIC_ISR_REVALIDATE_SECONDS = 14_400;

/** Next.js fetch cache tag for public API reads (deals, facets, categories, etc.). */
export const PUBLIC_DATA_CACHE_TAG = "public-data";

/** Fetch cache tag for curated giveaways (shorter TTL than listing ISR). */
export const GIVEAWAYS_CACHE_TAG = "giveaways";

/** Giveaways page + fetch TTL — contests can close between scrape cadences. */
export const GIVEAWAYS_REVALIDATE_SECONDS = 60;
