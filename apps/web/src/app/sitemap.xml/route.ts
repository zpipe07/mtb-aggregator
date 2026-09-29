import {
  buildSitemapEntries,
  SITEMAP_RESPONSE_HEADERS,
  sitemapEntriesToXml,
} from "@/lib/sitemapDocument";

/**
 * Built per miss, then held on the CDN for 4h. `sitemap.ts` + `force-dynamic`
 * regenerated the full catalog on every crawler hit (no `s-maxage`).
 * Generation stays request-time so `next build` does not paginate the live API.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await buildSitemapEntries();
  return new Response(sitemapEntriesToXml(entries), {
    headers: SITEMAP_RESPONSE_HEADERS,
  });
}
