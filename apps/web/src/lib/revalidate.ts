/**
 * Public ISR + fetch cache TTL. Aligned with API scrape cadence (~4h); shorter
 * intervals only increase Vercel ISR writes without fresher listing data.
 *
 * Route `export const revalidate` must use the literal `14400` — Next.js does not
 * accept imported identifiers in page config (see invalid-page-config).
 */
export const PUBLIC_ISR_REVALIDATE_SECONDS = 14_400;
