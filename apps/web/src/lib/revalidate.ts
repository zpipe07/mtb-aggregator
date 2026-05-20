/**
 * Public ISR + fetch cache TTL. Aligned with API scrape cadence (~4h); shorter
 * intervals only increase Vercel ISR writes without fresher listing data.
 */
export const PUBLIC_ISR_REVALIDATE_SECONDS = 14_400;

/** Sitemap URL list changes on scrape cadence, not hourly. */
export const SITEMAP_REVALIDATE_SECONDS = PUBLIC_ISR_REVALIDATE_SECONDS;
